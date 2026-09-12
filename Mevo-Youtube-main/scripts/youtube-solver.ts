/**
 * High-Performance Local YouTube Audio Extractor & Decipher Engine
 * Powered by yt-dlp EJS solver AST analysis (Meriyah + Astring).
 * Solves YouTube signatureCipher (sig) and throttle challenge (n) directly in Node.js
 * with zero bot detection and zero datacenter IP bans.
 */

import { parse as meriyahParse } from "meriyah";
import { generate as astringGenerate } from "astring";

// Simple in-memory cache for preprocessed player code & stream URLs
const playerCache = new Map<string, any>();
const streamCache = new Map<string, { url: string; expiresAt: number }>();

function matchesStructure(obj: any, structure: any): boolean {
  if (Array.isArray(structure)) {
    if (!Array.isArray(obj)) return false;
    return (
      structure.length === obj.length &&
      structure.every((value: any, index: number) => matchesStructure(obj[index], value))
    );
  }
  if (typeof structure === "object") {
    if (!obj) return !structure;
    if ("or" in structure) {
      return structure.or.some((node: any) => matchesStructure(obj, node));
    }
    if ("anykey" in structure && Array.isArray(structure.anykey)) {
      const haystack = Array.isArray(obj) ? obj : Object.values(obj);
      return structure.anykey.every((value: any) =>
        haystack.some((el: any) => matchesStructure(el, value))
      );
    }
    for (const [key, value] of Object.entries(structure)) {
      if (!matchesStructure(obj[key], value)) return false;
    }
    return true;
  }
  return structure === obj;
}

function isOneOf(value: any, ...of: any[]): boolean {
  return of.includes(value);
}

function generateArrowFunction(data: string) {
  return (meriyahParse(data) as any).body[0].expression;
}

function _optionalChain$1(ops: any[]) {
  let lastAccessLHS: any = undefined;
  let value = ops[0];
  let i = 1;
  while (i < ops.length) {
    const op = ops[i];
    const fn = ops[i + 1];
    i += 2;
    if ((op === "optionalAccess" || op === "optionalCall") && value == null) {
      return undefined;
    }
    if (op === "access" || op === "optionalAccess") {
      lastAccessLHS = value;
      value = fn(value);
    } else if (op === "call" || op === "optionalCall") {
      value = fn((...args: any[]) => value.call(lastAccessLHS, ...args));
      lastAccessLHS = undefined;
    }
  }
  return value;
}

const identifier = {
  or: [
    {
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: { or: [{ type: "Identifier" }, { type: "MemberExpression" }] },
        right: { type: "FunctionExpression", async: false },
      },
    },
    { type: "FunctionDeclaration", async: false, id: { type: "Identifier" } },
    {
      type: "VariableDeclaration",
      declarations: {
        anykey: [
          {
            type: "VariableDeclarator",
            init: { type: "FunctionExpression", async: false },
          },
        ],
      },
    },
  ],
};

const asdasd = {
  type: "ExpressionStatement",
  expression: {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: { type: "Identifier" },
      property: {},
      optional: false,
    },
    arguments: [
      { type: "Literal", value: "alr" },
      { type: "Literal", value: "yes" },
    ],
    optional: false,
  },
};

function extract(node: any) {
  if (!matchesStructure(node, identifier)) return null;
  const options: any[] = [];
  if (node.type === "FunctionDeclaration") {
    if (
      node.id &&
      _optionalChain$1([
        node,
        "access",
        (_: any) => _.body,
        "optionalAccess",
        (_2: any) => _2.body,
      ])
    ) {
      options.push({
        name: node.id,
        statements: _optionalChain$1([
          node,
          "access",
          (_3: any) => _3.body,
          "optionalAccess",
          (_4: any) => _4.body,
        ]),
      });
    }
  } else if (node.type === "ExpressionStatement") {
    if (node.expression.type !== "AssignmentExpression") return null;
    const name = node.expression.left;
    const body = _optionalChain$1([
      node.expression.right,
      "optionalAccess",
      (_5: any) => _5.body,
      "optionalAccess",
      (_6: any) => _6.body,
    ]);
    if (name && body) options.push({ name, statements: body });
  } else if (node.type === "VariableDeclaration") {
    for (const declaration of node.declarations) {
      const name = declaration.id;
      const body = _optionalChain$1([
        declaration.init,
        "optionalAccess",
        (_7: any) => _7.body,
        "optionalAccess",
        (_8: any) => _8.body,
      ]);
      if (name && body) options.push({ name, statements: body });
    }
  }
  for (const { name, statements } of options) {
    if (matchesStructure(statements, { anykey: [asdasd] })) {
      return createSolver(name);
    }
  }
  return null;
}

function createSolver(expression: any) {
  return generateArrowFunction(
    `\n({sig, n}) => {\n  const url = (${astringGenerate(expression)})("https://youtube.com/watch?v=yt-dlp-wins", "s", sig ? encodeURIComponent(sig) : undefined);\n  url.set("n", n);\n  const proto = Object.getPrototypeOf(url);\n  const keys = Object.keys(proto).concat(Object.getOwnPropertyNames(proto));\n  for (const key of keys) {\n    if (!["constructor", "set", "get", "clone"].includes(key)) {\n      url[key]();\n      break;\n    }\n  }\n  const s = url.get("s");\n  return {\n    sig: s ? decodeURIComponent(s) : null,\n    n: url.get("n") ?? null,\n  };\n}\n`
  );
}

const setupNodes = (
  meriyahParse(
    `\nif (typeof globalThis.XMLHttpRequest === "undefined") {\n    globalThis.XMLHttpRequest = { prototype: {} };\n}\nif (typeof URL === "undefined") {\n    globalThis.location = {\n        hash: "",\n        host: "www.youtube.com",\n        hostname: "www.youtube.com",\n        href: "https://www.youtube.com/watch?v=yt-dlp-wins",\n        origin: "https://www.youtube.com",\n        password: "",\n        pathname: "/watch",\n        port: "",\n        protocol: "https:",\n        search: "?v=yt-dlp-wins",\n        username: "",\n    };\n} else {\n    globalThis.location = new URL("https://www.youtube.com/watch?v=yt-dlp-wins");\n}\nif (typeof globalThis.document === "undefined") {\n    globalThis.document = Object.create(null);\n}\nif (typeof globalThis.navigator === "undefined") {\n    globalThis.navigator = Object.create(null);\n}\nif (typeof globalThis.self === "undefined") {\n    globalThis.self = globalThis;\n}\nif (typeof globalThis.window === "undefined") {\n    globalThis.window = globalThis;\n}\n`
  ) as any
).body;

function _optionalChain(ops: any[]) {
  let lastAccessLHS: any = undefined;
  let value = ops[0];
  let i = 1;
  while (i < ops.length) {
    const op = ops[i];
    const fn = ops[i + 1];
    i += 2;
    if ((op === "optionalAccess" || op === "optionalCall") && value == null) {
      return undefined;
    }
    if (op === "access" || op === "optionalAccess") {
      lastAccessLHS = value;
      value = fn(value);
    } else if (op === "call" || op === "optionalCall") {
      value = fn((...args: any[]) => value.call(lastAccessLHS, ...args));
      lastAccessLHS = undefined;
    }
  }
  return value;
}

function preprocessPlayer(data: string): string {
  const program = meriyahParse(data) as any;
  const plainStatements = modifyPlayer(program);
  const solutions = getSolutions(plainStatements);
  for (const [name, options] of Object.entries(solutions)) {
    plainStatements.push({
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          type: "MemberExpression",
          computed: false,
          object: { type: "Identifier", name: "_result" },
          property: { type: "Identifier", name },
          optional: false,
        },
        right: multiTry(options as any[]),
      },
    });
  }
  program.body.splice(0, 0, ...setupNodes);
  return astringGenerate(program);
}

function modifyPlayer(program: any) {
  const body = program.body;
  const block = (() => {
    switch (body.length) {
      case 1: {
        const func = body[0];
        if (
          _optionalChain([func, "optionalAccess", (_: any) => _.type]) ===
            "ExpressionStatement" &&
          func.expression.type === "CallExpression" &&
          func.expression.callee.type === "MemberExpression" &&
          func.expression.callee.object.type === "FunctionExpression"
        ) {
          return func.expression.callee.object.body;
        }
        break;
      }
      case 2: {
        const func = body[1];
        if (
          _optionalChain([func, "optionalAccess", (_2: any) => _2.type]) ===
            "ExpressionStatement" &&
          func.expression.type === "CallExpression" &&
          func.expression.callee.type === "FunctionExpression"
        ) {
          const block = func.expression.callee.body;
          block.body.splice(0, 1);
          return block;
        }
        break;
      }
    }
    throw new Error("unexpected player structure");
  })();
  block.body = block.body.filter((node: any) => {
    if (node.type === "ExpressionStatement") {
      if (node.expression.type === "AssignmentExpression") return true;
      return node.expression.type === "Literal";
    }
    return true;
  });
  return block.body;
}

function getSolutions(statements: any[]) {
  const found: { n: any[]; sig: any[] } = { n: [], sig: [] };
  for (const statement of statements) {
    const result = extract(statement);
    if (result) {
      found.n.push(makeSolver(result, { type: "Identifier", name: "n" }));
      found.sig.push(makeSolver(result, { type: "Identifier", name: "sig" }));
    }
  }
  return found;
}

function makeSolver(result: any, ident: any) {
  return {
    type: "ArrowFunctionExpression",
    params: [ident],
    body: {
      type: "MemberExpression",
      object: {
        type: "CallExpression",
        callee: result,
        arguments: [
          {
            type: "ObjectExpression",
            properties: [
              {
                type: "Property",
                key: ident,
                value: ident,
                kind: "init",
                computed: false,
                method: false,
                shorthand: true,
              },
            ],
          },
        ],
        optional: false,
      },
      computed: false,
      property: ident,
      optional: false,
    },
    async: false,
    expression: true,
    generator: false,
  };
}

function getFromPrepared(code: string) {
  const resultObj: { n: any; sig: any } = { n: null, sig: null };
  new Function("_result", code)(resultObj);
  return resultObj;
}

function multiTry(generators: any[]) {
  return generateArrowFunction(
    `\n(_input) => {\n  const _results = new Set();\n  const errors = [];\n  for (const _generator of ${astringGenerate({ type: "ArrayExpression", elements: generators } as any)}) {\n    try {\n      _results.add(_generator(_input));\n    } catch (e) {\n      errors.push(e);\n    }\n  }\n  if (!_results.size) {\n    throw \`no solutions: \${errors.join(", ")}\`;\n  }\n  if (_results.size !== 1) {\n    throw \`invalid solutions: \${[..._results].map(x => JSON.stringify(x)).join(", ")}\`;\n  }\n  return _results.values().next().value;\n}\n`
  );
}

function solveChallenges(input: any) {
  const preprocessedPlayer =
    input.type === "player"
      ? preprocessPlayer(input.player)
      : input.preprocessed_player;
  const solvers = getFromPrepared(preprocessedPlayer);
  const responses = input.requests.map((req: any) => {
    if (!isOneOf(req.type, "n", "sig")) {
      return { type: "error", error: `Unknown request type: ${req.type}` };
    }
    const solver = (solvers as Record<string, any>)[req.type];
    if (!solver) {
      return { type: "error", error: `Failed to extract ${req.type} function` };
    }
    try {
      return {
        type: "result",
        data: Object.fromEntries(
          req.challenges.map((challenge: string) => [
            challenge,
            solver(challenge),
          ])
        ),
      };
    } catch (error: any) {
      return {
        type: "error",
        error: error instanceof Error ? `${error.message}` : `${error}`,
      };
    }
  });
  return { type: "result", responses };
}

let lastKnownJsUrl = "https://www.youtube.com/s/player/230f3689/player_ias.vflset/en_US/base.js";

function findJsUrl(html: string): string | null {
  if (!html) return null;
  const match =
    html.match(/"jsUrl":"([^"]+base\.js)"/) ||
    html.match(/src="([^"]*\/base\.js)"/) ||
    html.match(/\/s\/player\/[a-zA-Z0-9_-]+\/player_ias\.vflset\/[^"]*\/base\.js/);
  if (!match) return null;
  const raw = match[1] || match[0];
  return raw.startsWith("http") ? raw : "https://www.youtube.com" + raw;
}

async function getPreprocessedPlayer(jsUrl: string): Promise<any> {
  let preprocessed = playerCache.get(jsUrl);
  if (!preprocessed) {
    try {
      const jsRes = await fetch(jsUrl);
      if (!jsRes.ok) return null;
      const playerJs = await jsRes.text();
      preprocessed = preprocessPlayer(playerJs);
      playerCache.set(jsUrl, preprocessed);
    } catch {
      return null;
    }
  }
  return preprocessed;
}

async function fetchPlayerResponse(cleanId: string): Promise<{ data: any; html: string } | null> {
  // 1. Mobile watch page (fastest, lightweight payload)
  try {
    const watchRes = await fetch(`https://m.youtube.com/watch?v=${cleanId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      const match =
        html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/) ||
        html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data?.streamingData) {
          return { data, html };
        }
      }
    }
  } catch {}

  // 2. Desktop watch page fallback
  try {
    const dRes = await fetch(`https://www.youtube.com/watch?v=${cleanId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (dRes.ok) {
      const html = await dRes.text();
      const match =
        dHtmlMatch(html);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data?.streamingData) {
          return { data, html };
        }
      }
    }
  } catch {}

  // 3. Innertube client fallback (ANDROID)
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.45.38 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        videoId: cleanId,
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.45.38",
            androidSdkVersion: 30,
            hl: "en",
            gl: "US",
          },
        },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.streamingData) {
        return { data, html: "" };
      }
    }
  } catch {}

  return null;
}

function dHtmlMatch(html: string) {
  return (
    html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/) ||
    html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/)
  );
}

/**
 * Extracts a high-quality playable audio stream URL for a given YouTube Video ID.
 */
export async function getDirectAudioStreamUrl(videoId: string, bypassCache = false): Promise<string | null> {
  const cleanId = videoId.replace(/^yt-/, "").trim();
  if (!cleanId) return null;

  if (bypassCache) {
    streamCache.delete(cleanId);
    playerCache.clear();
  } else {
    // Check in-memory stream cache
    const cached = streamCache.get(cleanId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.url;
    }
  }

  try {
    const playerResult = await fetchPlayerResponse(cleanId);
    if (!playerResult || !playerResult.data) {
      console.warn(`[YouTube Solver] No player response for ${cleanId}`);
      return null;
    }

    const { data, html } = playerResult;
    const detectedJsUrl = findJsUrl(html);
    if (detectedJsUrl) {
      lastKnownJsUrl = detectedJsUrl;
    }

    const allFormats = (data.streamingData?.adaptiveFormats || []).concat(
      data.streamingData?.formats || []
    );

    if (allFormats.length === 0) {
      console.warn(`[YouTube Solver] No formats found in streamingData for ${cleanId}`);
      return null;
    }

    // Filter candidates that possess either a direct url or a signatureCipher / cipher
    const candidates = allFormats.filter(
      (f: any) => f.url || f.signatureCipher || f.cipher
    );

    if (candidates.length === 0) {
      console.warn(`[YouTube Solver] No candidates with url or cipher for ${cleanId}`);
      return null;
    }

    // Sort to prioritize:
    // 1. Dedicated audio: itag 140 (AAC 128k), then itag 251 (Opus 160k), 250, 249, other audio by bitrate
    // 2. Progressive formats: itag 18, 22 (contain stereo AAC audio tracks playable by HTMLAudioElement)
    // 3. Other formats by bitrate
    candidates.sort((a: any, b: any) => {
      const aAudio = Boolean(a.mimeType?.includes("audio"));
      const bAudio = Boolean(b.mimeType?.includes("audio"));
      if (aAudio && !bAudio) return -1;
      if (!aAudio && bAudio) return 1;

      if (a.itag === 140) return -1;
      if (b.itag === 140) return 1;

      if (a.itag === 251) return -1;
      if (b.itag === 251) return 1;

      const aProg = Boolean(a.mimeType?.includes("video/mp4") && (a.itag === 18 || a.itag === 22));
      const bProg = Boolean(b.mimeType?.includes("video/mp4") && (b.itag === 18 || b.itag === 22));
      if (aProg && !bProg) return -1;
      if (!aProg && bProg) return 1;

      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    // Attempt candidates in priority order until a valid playable direct stream is obtained
    for (const format of candidates) {
      try {
        // Direct URL format
        if (format.url) {
          const urlObj = new URL(format.url);
          const n = urlObj.searchParams.get("n");
          if (n) {
            const preprocessed = await getPreprocessedPlayer(lastKnownJsUrl);
            if (preprocessed) {
              const solution = solveChallenges({
                type: "preprocessed",
                preprocessed_player: preprocessed,
                requests: [{ type: "n", challenges: [n] }],
              });
              const solvedN = solution.responses[0]?.data?.[n];
              if (solvedN) {
                urlObj.searchParams.set("n", solvedN);
              }
            }
          }
          const finalUrl = urlObj.toString();
          streamCache.set(cleanId, {
            url: finalUrl,
            expiresAt: Date.now() + 3 * 3600 * 1000,
          });
          return finalUrl;
        }

        // Signature cipher format
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) continue;

        const params = new URLSearchParams(cipher);
        const s = params.get("s");
        const sp = params.get("sp") || "sig";
        const rawUrl = params.get("url");
        if (!rawUrl || !s) continue;

        const urlObj = new URL(rawUrl);
        const n = urlObj.searchParams.get("n");

        const preprocessed = await getPreprocessedPlayer(lastKnownJsUrl);
        if (!preprocessed) continue;

        const requests: any[] = [{ type: "sig", challenges: [s] }];
        if (n) {
          requests.push({ type: "n", challenges: [n] });
        }

        const solution = solveChallenges({
          type: "preprocessed",
          preprocessed_player: preprocessed,
          requests,
        });

        const decipheredS = solution.responses[0]?.data?.[s];
        if (!decipheredS) {
          continue;
        }

        urlObj.searchParams.set(sp, decipheredS);

        if (n) {
          const solvedN = solution.responses[1]?.data?.[n];
          if (solvedN) {
            urlObj.searchParams.set("n", solvedN);
          }
        }

        const finalUrl = urlObj.toString();
        streamCache.set(cleanId, {
          url: finalUrl,
          expiresAt: Date.now() + 3 * 3600 * 1000,
        });
        return finalUrl;
      } catch (candidateErr: any) {
        console.warn(`[YouTube Solver] itag ${format.itag} resolution notice:`, candidateErr.message);
        continue;
      }
    }

    console.warn(`[YouTube Solver] All format candidates exhausted for ${cleanId}`);
    return null;
  } catch (err: any) {
    console.error(`[YouTube Solver] Extraction error for ${cleanId}:`, err.message);
    return null;
  }
}
