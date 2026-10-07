// Ensures compatibility between Expo CLI (expects ws.WebSocketServer) and Metro/React Native (ws v7).
const fs = require("node:fs");
const path = require("node:path");

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    let content = fs.readFileSync(filePath, "utf8");
    if (!content.includes("WebSocketServer")) {
      content = content.replace(
        "module.exports = WebSocket;",
        "WebSocket.WebSocketServer = WebSocket.Server;\nWebSocket.WebSocket = WebSocket;\n\nmodule.exports = WebSocket;"
      );
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`[patch-ws] Patched ${filePath}`);
    }
  } catch (err) {
    console.warn(`[patch-ws] Failed to patch ${filePath}:`, err.message);
  }
}

function findWsIndexFiles(dir, depth = 0) {
  if (depth > 5 || !fs.existsSync(dir)) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "ws") {
          const indexFile = path.join(fullPath, "index.js");
          if (fs.existsSync(indexFile)) {
            results.push(indexFile);
          }
        } else if (entry.name !== ".git" && entry.name !== ".cache") {
          results.push(...findWsIndexFiles(fullPath, depth + 1));
        }
      }
    }
  } catch {}
  return results;
}

const nodeModulesDir = path.resolve(__dirname, "../node_modules");
const wsFiles = findWsIndexFiles(nodeModulesDir);

for (const file of wsFiles) {
  patchFile(file);
}

// Also ensure expo/node_modules/@expo/cli has access to ws if missing
const nestedExpoCliWs = path.resolve(nodeModulesDir, "expo/node_modules/@expo/cli/node_modules/ws");
const rootWs = path.resolve(nodeModulesDir, "ws");
if (!fs.existsSync(nestedExpoCliWs) && fs.existsSync(rootWs)) {
  try {
    fs.mkdirSync(path.dirname(nestedExpoCliWs), { recursive: true });
    fs.cpSync(rootWs, nestedExpoCliWs, { recursive: true });
    console.log(`[patch-ws] Copied ws to ${nestedExpoCliWs}`);
  } catch (err) {
    console.warn(`[patch-ws] Could not copy ws to nested @expo/cli:`, err.message);
  }
}
