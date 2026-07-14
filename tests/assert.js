// Minimal assert harness — no external test framework dependency.

let passCount = 0;
let failCount = 0;

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  report(ok, message, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(actual, message) {
  report(actual === true, message, `expected true, got ${JSON.stringify(actual)}`);
}

function assertFalse(actual, message) {
  report(actual === false, message, `expected false, got ${JSON.stringify(actual)}`);
}

function report(ok, message, detail) {
  if (ok) {
    passCount++;
    console.log(`  PASS  ${message}`);
  } else {
    failCount++;
    console.error(`  FAIL  ${message} — ${detail}`);
  }
}

function summary() {
  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
}

module.exports = { assertEqual, assertTrue, assertFalse, summary };
