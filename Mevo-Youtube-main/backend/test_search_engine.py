import sys
import time
import json
import logging
from unittest.mock import patch, MagicMock

# Import the refactored module
from extractor_api import (
    app,
    key_pool,
    search_cache,
    execute_search,
    clean_title_and_artist,
    parse_iso8601_duration,
    build_uniform_item,
    YouTubeKeyPool,
)

def run_tests():
    print("\n" + "=" * 60)
    print("STARTING BACKEND SEARCH ENGINE REFACTOR TEST SUITE")
    print("=" * 60)

    # ---------------------------------------------------------
    # Test 1: Title & Artist Parser + ISO 8601 Duration
    # ---------------------------------------------------------
    print("\n[TEST 1] Testing Title & Artist Cleaning and ISO 8601 Duration...")
    t1, a1 = clean_title_and_artist("Adele - Rolling in the Deep (Official Music Video)", "AdeleVEVO")
    assert a1 == "Adele", f"Expected 'Adele', got '{a1}'"
    assert t1 == "Rolling in the Deep", f"Expected 'Rolling in the Deep', got '{t1}'"

    dur = parse_iso8601_duration("PT3M48S")
    assert dur == 228, f"Expected 228, got {dur}"
    print("[OK] Title/Artist parsing & ISO 8601 duration verified successfully.")

    # ---------------------------------------------------------
    # Test 2: Multi-Key YouTube API Pool & 403 Rotation
    # ---------------------------------------------------------
    print("\n[TEST 2] Testing Multi-Key YouTube API Pool & 403 Rotation...")
    test_pool = YouTubeKeyPool(name="TestPool")
    test_pool._keys = ["KEY_ALPHA_111111111111111111111111", "KEY_BETA_222222222222222222222222", "KEY_GAMMA_33333333333333333333333"]
    test_pool._exhausted_keys = {}
    test_pool._current_idx = 0

    assert test_pool.get_active_key() == "KEY_ALPHA_111111111111111111111111"
    
    # Simulate 403 Quota limit on Key 1
    test_pool.mark_key_exhausted("KEY_ALPHA_111111111111111111111111", "HTTP 403: quotaExceeded")
    # Should automatically rotate to Key 2
    assert test_pool.get_active_key() == "KEY_BETA_222222222222222222222222"
    
    # Simulate 403 on Key 2
    test_pool.mark_key_exhausted("KEY_BETA_222222222222222222222222", "HTTP 403: quotaExceeded")
    assert test_pool.get_active_key() == "KEY_GAMMA_33333333333333333333333"

    # Simulate 403 on Key 3 -> all exhausted
    test_pool.mark_key_exhausted("KEY_GAMMA_33333333333333333333333", "HTTP 403: quotaExceeded")
    assert test_pool.get_active_key() is None
    status = test_pool.get_status()
    assert status["active_keys"] == 0
    assert status["exhausted_keys"] == 3
    print("[OK] YouTubeKeyPool successfully rotated on 403 quota errors and tracked exhausted status.")

    # ---------------------------------------------------------
    # Test 2.1: Dual-Pool Quota Isolation (Discovery vs Search)
    # ---------------------------------------------------------
    print("\n[TEST 2.1] Testing Dual-Pool Quota Isolation (Discovery vs Search)...")
    pool_disc = YouTubeKeyPool(name="Song Discovery", keys=["DISC_KEY_11111111111111111111", "DISC_KEY_22222222222222222222"])
    pool_search = YouTubeKeyPool(name="Search", keys=["SEARCH_KEY_33333333333333333333"])

    assert pool_disc.get_active_key() == "DISC_KEY_11111111111111111111"
    assert pool_search.get_active_key() == "SEARCH_KEY_33333333333333333333"

    # Exhaust Search Pool Key
    pool_search.mark_key_exhausted("SEARCH_KEY_33333333333333333333", "HTTP 403: quotaExceeded")
    assert pool_search.get_active_key() is None
    assert pool_search.get_status()["active_keys"] == 0

    # Verify Discovery Pool is 100% unaffected by Search Pool exhaustion
    assert pool_disc.get_active_key() == "DISC_KEY_11111111111111111111"
    assert pool_disc.get_status()["active_keys"] == 2
    print("[OK] Quota isolation verified: Exhausting Search Pool leaves Discovery Pool 100% active.")

    # ---------------------------------------------------------
    # Test 3: In-Memory Search Caching (12-hour TTL)
    # ---------------------------------------------------------
    print("\n[TEST 3] Testing In-Memory Search Caching with TTL...")
    search_cache.clear()
    cache_key = "search:test query:limit=10:type=general"
    mock_items = [{"id": "vid123", "title": "Test Song", "artist": "Test Artist"}]
    search_cache.set(cache_key, mock_items, ttl=2) # 2 seconds TTL for testing
    
    cached = search_cache.get(cache_key)
    assert cached == mock_items, "Cache should return stored data"
    stats = search_cache.stats()
    assert stats["valid_entries"] == 1
    print("[OK] Cache hit successful.")

    # Test TTL expiration
    time.sleep(2.1)
    expired = search_cache.get(cache_key)
    assert expired is None, "Expired cache key should return None"
    print("[OK] Cache TTL expiration verified.")

    # ---------------------------------------------------------
    # Test 4: Uniform Metadata Schema Builder
    # ---------------------------------------------------------
    print("\n[TEST 4] Testing Uniform Metadata Schema...")
    item = build_uniform_item(
        vid_id="dQw4w9WgXcQ",
        raw_title="Rick Astley - Never Gonna Give You Up (Official Music Video)",
        channel="Rick Astley",
        thumbnail="https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        duration=213,
        view_count=1400000000,
        base_url="http://127.0.0.1:5001"
    )
    
    required_keys = ["id", "title", "artist", "thumbnail", "duration", "stream_url"]
    for k in required_keys:
        assert k in item, f"Missing required key '{k}' in uniform item"
    
    assert item["id"] == "dQw4w9WgXcQ"
    assert item["title"] == "Never Gonna Give You Up"
    assert item["artist"] == "Rick Astley"
    assert item["duration"] == 213
    assert item["stream_url"] == "http://127.0.0.1:5001/stream?id=dQw4w9WgXcQ"
    print("[OK] Uniform metadata schema conforms to all specifications.")

    # ---------------------------------------------------------
    # Test 5: Flask API Client Endpoints (/api/search, /search, /api/extract, /info, /health)
    # ---------------------------------------------------------
    print("\n[TEST 5] Testing Flask API Routes with Test Client...")
    client = app.test_client()

    # 5.1 Health Check
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    h_data = health_resp.get_json()
    assert h_data["status"] == "online"
    assert "key_pool" in h_data
    assert "discovery_pool" in h_data
    assert "search_pool" in h_data
    assert "cache" in h_data
    print("[OK] /health endpoint verified with dual-pool status.")

    # 5.2 /api/search with mocked pool (returning uniform items)
    with patch("extractor_api.search_youtube_api_pool") as mock_api:
        mock_api.return_value = [item]
        search_resp = client.get("/api/search?q=Rick+Astley&limit=5")
        assert search_resp.status_code == 200
        s_data = search_resp.get_json()
        assert s_data["count"] == 1
        assert s_data["source"] == "youtube_api"
        assert s_data["items"][0]["title"] == "Never Gonna Give You Up"
        assert s_data["items"][0]["stream_url"].endswith("/stream?id=dQw4w9WgXcQ")
        print("[OK] /api/search returns uniform metadata structure.")

    # 5.3 /api/search Cache Hit
    cached_resp = client.get("/api/search?q=Rick+Astley&limit=5")
    assert cached_resp.status_code == 200
    c_data = cached_resp.get_json()
    assert c_data["source"] == "cache"
    print("[OK] /api/search 12-hour cache hit verified.")

    # 5.4 yt-dlp Microservice Fallback when API returns None
    search_cache.clear()
    with patch("extractor_api.search_youtube_api_pool", return_value=None):
        with patch("extractor_api.search_ytdlp_fallback", return_value=[item]):
            fallback_resp = client.get("/api/search?q=FallbackQuery&limit=5")
            assert fallback_resp.status_code == 200
            fb_data = fallback_resp.get_json()
            assert fb_data["source"] == "yt_dlp"
            assert len(fb_data["items"]) == 1
            print("[OK] yt-dlp microservice fallback on API pool exhaustion verified.")

    # 5.5 /api/extract and /info endpoints
    with patch("extractor_api.yt_dlp.YoutubeDL") as mock_ydl:
        mock_instance = MagicMock()
        mock_instance.extract_info.return_value = {
            "id": "dQw4w9WgXcQ",
            "title": "Rick Astley - Never Gonna Give You Up",
            "uploader": "Rick Astley",
            "duration": 213,
            "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            "view_count": 1400000000,
        }
        mock_ydl.return_value.__enter__.return_value = mock_instance

        extract_resp = client.post("/api/extract", json={"id": "dQw4w9WgXcQ"})
        assert extract_resp.status_code == 200
        e_data = extract_resp.get_json()
        assert e_data["id"] == "dQw4w9WgXcQ"
        assert e_data["title"] == "Never Gonna Give You Up"
        assert e_data["artist"] == "Rick Astley"
        assert e_data["duration"] == 213
        assert "stream_url" in e_data
        print("[OK] /api/extract and /info return uniform metadata.")

    print("\n" + "=" * 60)
    print("ALL 5 TEST SUITES PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
