import fs from 'fs';
import path from 'path';

const channelPath = path.join(__dirname, '../../node_modules/node-routeros/dist/Channel.js');

function patch() {
  if (!fs.existsSync(channelPath)) {
    console.log('[RouterOS Patch] node-routeros package not found, skipping patch.');
    return;
  }

  let content = fs.readFileSync(channelPath, 'utf8');

  // Check if already patched
  if (content.includes("case '!empty':")) {
    console.log('[RouterOS Patch] node-routeros is already patched for !empty responses.');
    return;
  }

  // Find the !done case and prepend !empty case
  const target = "case '!done':";
  if (content.includes(target)) {
    const replacement = "case '!empty':\n            case '!done':";
    content = content.replace(target, replacement);
    fs.writeFileSync(channelPath, content, 'utf8');
    console.log('[RouterOS Patch] Successfully patched node-routeros Channel.js to handle !empty responses.');
  } else {
    console.error('[RouterOS Patch] Could not find case "!done" in Channel.js to apply patch.');
  }
}

patch();
