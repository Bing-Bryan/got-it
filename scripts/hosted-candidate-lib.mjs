import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');

async function listFiles(root, relative = '') {
  const files = [];
  const entries = await fs.readdir(path.join(root, relative), {withFileTypes: true});

  for (const entry of entries) {
    const item = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error(`拒绝符号链接: ${item}`);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, item));
    } else if (entry.isFile()) {
      files.push(item);
    } else {
      throw Error(`拒绝特殊文件: ${item}`);
    }
  }

  return files;
}

function validateManifestShape(manifest) {
  if (!/^hosted-[a-f0-9]{16}$/.test(manifest.candidateId)) {
    throw Error('候选 ID 格式无效');
  }
  if (!Array.isArray(manifest.files) || !manifest.frontend || !manifest.api ||
      !manifest.compatibility || !manifest.rollback) {
    throw Error('候选清单字段不完整');
  }
  if (manifest.frontend.path !== 'frontend') {
    throw Error('候选前端目录必须固定为 frontend');
  }
}

function validateFileList(actual, listed) {
  const actualFiles = actual.filter(file => file !== 'manifest.json').sort();
  const listedFiles = listed.map(file => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(listedFiles)) {
    throw Error('候选文件缺失或多出文件');
  }
}

async function verifyListedFiles(root, files) {
  for (const file of files) {
    if (typeof file.path !== 'string' || file.path.startsWith('/') ||
        file.path.split('/').includes('..') || file.path === 'manifest.json') {
      throw Error('清单路径穿越或覆盖身份文件');
    }

    const filePath = path.join(root, file.path);
    const stat = await fs.lstat(filePath);
    const content = await fs.readFile(filePath);
    if (!stat.isFile() || stat.size !== file.size || digest(content) !== file.sha256) {
      throw Error(`候选文件校验失败: ${file.path}`);
    }
  }
}

function verifyApiIdentity(manifest) {
  const runtimeFiles = manifest.files
    .filter(file => file.path.startsWith('runtime/'))
    .map(file => [file.path, file.sha256]);
  const inputDigest = digest(JSON.stringify(runtimeFiles));

  if (manifest.api.inputSha256 !== inputDigest || manifest.api.id !== `api-${inputDigest.slice(0, 16)}`) {
    throw Error('API 身份与运行源码摘要不匹配');
  }

  const lockFile = manifest.files.find(file => file.path === 'runtime/package-lock.json');
  if (!lockFile || manifest.api.dependencyLockSha256 !== lockFile.sha256) {
    throw Error('依赖锁文件摘要与 API 身份清单不匹配');
  }
}

function verifyCandidateIdentity(manifest) {
  const content = {...manifest};
  delete content.candidateId;
  const candidateId = `hosted-${digest(JSON.stringify(content)).slice(0, 16)}`;
  if (candidateId !== manifest.candidateId) throw Error('候选清单身份摘要不匹配');
}

/** Validate a frozen candidate without changing it. */
export async function verifyCandidate(candidateRoot) {
  const root = path.resolve(candidateRoot);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  validateManifestShape(manifest);

  const actualFiles = await listFiles(root);
  validateFileList(actualFiles, manifest.files);
  await verifyListedFiles(root, manifest.files);

  if (!manifest.files.some(file => file.path === 'frontend/index.html') ||
      !manifest.files.some(file => file.path === 'runtime/server/hosted-index.ts')) {
    throw Error('候选缺少前端入口或 API 运行入口');
  }

  verifyApiIdentity(manifest);
  verifyCandidateIdentity(manifest);
  return {root, manifest, files: manifest.files};
}

/** Parse TypeScript and resolve the runtime import graph; comments and string literals are ignored. */
export async function collectApiSourceClosure(entryPoint, projectRoot) {
  const root = await fs.realpath(projectRoot);
  const entry = path.resolve(root, entryPoint);
  const relativeEntry = path.relative(root, entry);
  if (relativeEntry.startsWith(`..${path.sep}`) || relativeEntry === '..' || path.isAbsolute(relativeEntry)) {
    throw Error('托管 API 入口越出项目根目录');
  }

  const {build} = await import('esbuild');
  const rejectSymlinkImport = async (specifier, importerDirectory) => {
    if (!specifier.startsWith('.')) return;
    const direct = path.resolve(importerDirectory, specifier);
    const candidates = [direct];
    if (!path.extname(direct)) {
      for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.js']) {
        candidates.push(`${direct}${extension}`);
      }
    } else if (/\.[cm]?jsx?$/.test(direct)) {
      const stem = direct.replace(/\.[cm]?jsx?$/, '');
      candidates.push(`${stem}.ts`, `${stem}.tsx`);
    }

    for (const candidate of candidates) {
      let cursor = root;
      const relative = path.relative(root, candidate);
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
        throw Error(`API 本地依赖越界: ${specifier}`);
      }
      for (const component of relative.split(path.sep)) {
        cursor = path.join(cursor, component);
        try {
          const stat = await fs.lstat(cursor);
          if (stat.isSymbolicLink()) throw Error(`拒绝 API 依赖符号链接: ${path.relative(root, cursor)}`);
        } catch (error) {
          if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break;
          throw error;
        }
      }
    }
  };
  let result;
  try {
    result = await build({
      absWorkingDir: root,
      entryPoints: [relativeEntry],
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      metafile: true,
      write: false,
      logLevel: 'silent',
      plugins: [{
        name: 'reject-symlinked-local-api-inputs',
        setup(build) {
          build.onResolve({filter: /^\./}, async args => {
            await rejectSymlinkImport(args.path, args.resolveDir);
            return null;
          });
        },
      }],
    });
  } catch (error) {
    throw Error(`TypeScript/API 依赖无法解析: ${error.message}`);
  }
  if (result.warnings.length) {
    throw Error(`TypeScript/API 依赖图存在未解析警告: ${result.warnings.map(warning => warning.text).join('; ')}`);
  }

  const files = [];
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(root, input);
    const relative = path.relative(root, file);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative) || /\.d\.[cm]?ts$/i.test(file)) {
      throw Error(`API 本地依赖越界或为声明文件: ${input}`);
    }
    let cursor = root;
    for (const component of relative.split(path.sep)) {
      cursor = path.join(cursor, component);
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw Error(`拒绝 API 依赖符号链接: ${relative}`);
    }
    if (!(await fs.stat(file)).isFile()) throw Error(`API 依赖不是普通文件: ${relative}`);
    files.push(file);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/** Validate a dependency-installed runtime copy against the frozen source inputs. */
export async function verifyRuntimeDirectory(candidateRoot, runtimeDirectory) {
  const candidate = path.resolve(candidateRoot);
  const runtime = path.resolve(runtimeDirectory);
  const isWithin = (base, target) => {
    const relative = path.relative(base, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  };
  if (isWithin(candidate, runtime) || isWithin(runtime, candidate)) {
    throw Error('运行时依赖必须安装在候选目录之外的暂存副本中');
  }

  const rootStat = await fs.lstat(runtime);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('暂存运行时目录无效');

  const expected = new Map();
  for (const file of (await verifyCandidate(candidate)).files) {
    if (file.path.startsWith('runtime/')) expected.set(file.path.slice('runtime/'.length), file);
  }

  const actual = await listRuntimeFiles(runtime);
  const actualPaths = actual.map(file => file.path).sort();
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw Error('暂存运行时含缺失或额外的源码输入');
  }

  for (const file of actual) {
    const source = expected.get(file.path);
    if (file.size !== source.size || file.sha256 !== source.sha256) {
      throw Error(`暂存运行时与冻结候选不符: ${file.path}`);
    }
  }

  const modules = path.join(runtime, 'node_modules');
  const modulesStat = await fs.lstat(modules).catch(() => null);
  if (!modulesStat?.isDirectory() || modulesStat.isSymbolicLink()) {
    throw Error('暂存运行时缺少独立 node_modules');
  }

  return {runtime, files: actual};
}

async function listRuntimeFiles(root, relative = '') {
  const files = [];
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, {withFileTypes: true});

  for (const entry of entries) {
    if (!relative && entry.name === 'node_modules') {
      if (entry.isSymbolicLink()) throw Error('node_modules 不得是符号链接');
      continue;
    }

    const item = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw Error(`暂存运行时拒绝符号链接: ${item}`);
    if (entry.isDirectory()) {
      files.push(...await listRuntimeFiles(root, item));
    } else if (entry.isFile()) {
      const content = await fs.readFile(path.join(root, item));
      files.push({path: item, size: content.length, sha256: digest(content)});
    } else {
      throw Error(`暂存运行时拒绝特殊文件: ${item}`);
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}
