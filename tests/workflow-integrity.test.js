const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'update-accuracy.yml'), 'utf8');
const ciWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

test('official artifact integrity gate passes on the current artifacts', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-official-artifacts.js'], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  const dldRecords = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dld-transactions.json'), 'utf8')).length;
  const accuracyRecords = JSON.parse(fs.readFileSync(path.join(root, 'data', 'accuracy-data.json'), 'utf8')).records.length;
  assert.equal(result.dldRecords, dldRecords);
  assert.equal(result.accuracyRecords, accuracyRecords);
});

test('daily accuracy workflow has deterministic concurrency, pinned actions, and required gates', () => {
  assert.match(workflow, /concurrency:\n  group: accuracy-update-main\n  cancel-in-progress: false/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(workflow, /actions\/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065/);
  assert.match(workflow, /python -m pip install --requirement requirements-accuracy\.txt/);
  assert.match(workflow, /Validate official artifacts and provenance/);
  assert.match(workflow, /Final integrity gate before commit/);
  assert.match(workflow, /Optional Layer 5/);
  assert.match(workflow, /Optional Layer 9/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /refusing to push a stale generated snapshot/);
  assert.match(workflow, /git diff --staged --check/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /git stash pop \|\| true/);
});

test('main CI workflow uses pinned action commits', () => {
  assert.match(ciWorkflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(ciWorkflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.doesNotMatch(ciWorkflow, /uses:\s*actions\/[^@\s]+@v\d/);
});

test('pinned accuracy requirements contain no floating versions', () => {
  const requirements = fs.readFileSync(path.join(root, 'requirements-accuracy.txt'), 'utf8');
  const lines = requirements.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  assert.deepEqual(lines, [
    'numpy==2.1.3',
    'pandas==2.2.3',
    'scikit-learn==1.5.2',
    'xgboost==2.1.4'
  ]);
});
