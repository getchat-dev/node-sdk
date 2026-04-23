import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURES_ROOT = path.join(__dirname, '..', 'fixtures');

export function loadFixture<T = unknown>(id: string): T {
    const normalized = id.replace(/\./g, '/');
    const file = path.join(FIXTURES_ROOT, `${normalized}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function loadRawFixture(id: string): string {
    const file = path.join(FIXTURES_ROOT, 'raw', id);
    return fs.readFileSync(file, 'utf8');
}
