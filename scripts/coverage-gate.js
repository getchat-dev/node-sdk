#!/usr/bin/env node
/**
 * Coverage gate: reads lcov output from node --test --experimental-test-coverage
 * and fails with exit code 1 if any file in ALLOW_LIST has line/function/branch
 * coverage below THRESHOLD (100% by default).
 *
 * Usage: node scripts/coverage-gate.js [path-to-lcov.info]
 */
const fs = require('node:fs');
const path = require('node:path');

const LCOV_PATH = process.argv[2] || path.join(__dirname, '..', 'coverage', 'lcov.info');
// 90% floor accommodates unavoidable TS emit artifacts (type-only lines, prelude, compiler helpers).
const THRESHOLD = 90;

// Files that must hit the threshold. Paths relative to repo root.
const ALLOW_LIST = new Set([
    'src/index.ts',
    'src/libs/helpers.ts',
    'src/libs/processUserRights.ts',
    'src/libs/signing.ts',
]);

function parseLcov(content) {
    const records = [];
    let current = null;
    for (const line of content.split('\n')) {
        if (line.startsWith('SF:')) {
            current = { file: line.slice(3), lh: 0, lf: 0, fh: 0, fn: 0, bh: 0, bf: 0 };
        } else if (line.startsWith('LH:')) current.lh = Number(line.slice(3));
        else if (line.startsWith('LF:')) current.lf = Number(line.slice(3));
        else if (line.startsWith('FNH:')) current.fh = Number(line.slice(4));
        else if (line.startsWith('FNF:')) current.fn = Number(line.slice(4));
        else if (line.startsWith('BRH:')) current.bh = Number(line.slice(4));
        else if (line.startsWith('BRF:')) current.bf = Number(line.slice(4));
        else if (line === 'end_of_record' && current) {
            records.push(current);
            current = null;
        }
    }
    return records;
}

function pct(hit, total) {
    return total === 0 ? 100 : (hit / total) * 100;
}

function normalizeFile(filePath) {
    const root = path.resolve(__dirname, '..');
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
    return path.relative(root, abs);
}

function main() {
    if (!fs.existsSync(LCOV_PATH)) {
        console.error(`coverage-gate: lcov file not found at ${LCOV_PATH}`);
        process.exit(2);
    }

    const records = parseLcov(fs.readFileSync(LCOV_PATH, 'utf8'));
    const byFile = new Map();
    for (const r of records) byFile.set(normalizeFile(r.file), r);

    const missing = [];
    const failures = [];

    for (const target of ALLOW_LIST) {
        const r = byFile.get(target);
        if (!r) {
            missing.push(target);
            continue;
        }
        const lines = pct(r.lh, r.lf);
        const funcs = pct(r.fh, r.fn);
        const branches = pct(r.bh, r.bf);
        console.log(
            `${target.padEnd(36)}  lines=${lines.toFixed(2)}%  funcs=${funcs.toFixed(2)}%  branches=${branches.toFixed(2)}%`,
        );
        if (lines < THRESHOLD || funcs < THRESHOLD || branches < THRESHOLD) {
            failures.push({ file: target, lines, funcs, branches });
        }
    }

    if (missing.length) {
        console.error(`\ncoverage-gate: no coverage data for:\n  - ${missing.join('\n  - ')}`);
        process.exit(1);
    }
    if (failures.length) {
        console.error(`\ncoverage-gate: ${failures.length} file(s) below ${THRESHOLD}% threshold`);
        for (const f of failures) {
            console.error(
                `  - ${f.file}: lines=${f.lines.toFixed(2)}% funcs=${f.funcs.toFixed(2)}% branches=${f.branches.toFixed(2)}%`,
            );
        }
        process.exit(1);
    }
    console.log(`\ncoverage-gate: OK (${ALLOW_LIST.size} files at ${THRESHOLD}%)`);
}

main();
