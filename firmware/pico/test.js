// replace-uf2-strings.js
import { readFileSync, writeFileSync } from "fs";

function replaceLiteral(buf, oldStr, newStr) {
  const oldBytes = Buffer.from(oldStr, "ascii");
  const newBytes = Buffer.from(newStr, "ascii");

  if (newBytes.length > oldBytes.length) {
    throw new Error(`New string too long (max ${oldBytes.length}, got ${newBytes.length})`);
  }

  const idx = buf.indexOf(oldBytes);
  if (idx === -1) {
    throw new Error(`Old string not found: ${oldStr}`);
  }

  // pad new string with nulls to preserve size
  const padded = Buffer.concat([newBytes, Buffer.alloc(oldBytes.length - newBytes.length, 0)]);
  padded.copy(buf, idx);
}

function replacePossiblySplitAscii(buf, fullOld, fullNew) {
  const oldB = Buffer.from(fullOld, "ascii");
  const newB = Buffer.from(fullNew, "ascii");
  if (oldB.length !== newB.length) {
    throw new Error("New string length must match old string length");
  }

  // Try contiguous first
  const idx = buf.indexOf(oldB);
  if (idx !== -1) {
    newB.copy(buf, idx);
    console.log(`Replaced contiguous "${fullOld}"`);
    return;
  }

  // Try split: search for any split point where both halves appear in order
  for (let split = 1; split < oldB.length; ++split) {
    const p1 = oldB.slice(0, split);
    const p2 = oldB.slice(split);
    const idx1 = buf.indexOf(p1);
    if (idx1 === -1) continue;
    const idx2 = buf.indexOf(p2, idx1 + p1.length);
    if (idx2 === -1) continue;
    // Replace in-place both parts
    newB.slice(0, split).copy(buf, idx1);
    newB.slice(split).copy(buf, idx2);
    console.log(`Replaced split "${fullOld}" at ${idx1} and ${idx2} (split=${split})`);
    return;
  }

  throw new Error(`Could not locate "${fullOld}" contiguous or split`);
}

function padToLen(str, len) {
  const buf = Buffer.from(str, "ascii");
  if (buf.length > len) {
    throw new Error(`String too long for target length ${len}`);
  }
  const out = Buffer.alloc(len, 0);
  buf.copy(out);
  return out.toString("ascii");
}

const input = "build/devicesdk-client.uf2";      // source UF2
const output = "devicesdk-client.patched.uf2"; // destination UF2

const buf = readFileSync(input);

// Replace using the current literals embedded by CMake (exact matches required)
// SSID may be split across blocks in UF2; handle contiguous or split.
const oldSsid = "8d477eda147344f8b9b8d3e3bef7505b";
const oldPass = "ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8";
const oldTok  = "e343ecb8036442e093a47718463c1716";

const newSsidFull = padToLen("Caravela", Buffer.byteLength(oldSsid, "ascii")); // 32-byte, null-padded
const newPass = padToLen("12345679", Buffer.byteLength(oldPass, "ascii"));     // match old length
const newTok  = padToLen("MyToken123", Buffer.byteLength(oldTok, "ascii"));    // match old length

replacePossiblySplitAscii(buf, oldSsid, newSsidFull);
replacePossiblySplitAscii(buf, oldPass, newPass);
replacePossiblySplitAscii(buf, oldTok, newTok);

writeFileSync(output, buf);
console.log("Patched UF2 written to", output);
