import { createInterface } from 'readline';
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { HARNESS_DIR, STATE_FILE, CONFIG_FILE, initialState, writeState } from '../lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

function ask(rl, question, defaultVal = '') {
  return new Promise(resolve => {
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(prompt, answer => resolve(answer.trim() || defaultVal));
  });
}

function copyDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function detectProject() {
  const cwd = process.cwd();
  const d = {
    projectName:  basename(cwd),
    language:     '',
    testCmd:      '',
    lintCmd:      '',
    typecheckCmd: '',
    buildCmd:     '',
    devCmd:       '',
    sources:      [],
  };

  // Node.js / JavaScript / TypeScript
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    if (pkg) {
      d.sources.push('package.json');
      if (pkg.name) d.projectName = pkg.name;

      const s = pkg.scripts || {};
      if (s.test)                d.testCmd      = 'npm test';
      if (s.lint)                d.lintCmd      = 'npm run lint';
      if (s.build)               d.buildCmd     = 'npm run build';
      if (s.dev)                 d.devCmd       = 'npm run dev';
      else if (s.start)          d.devCmd       = 'npm start';
      if (s.typecheck)           d.typecheckCmd = 'npm run typecheck';
      else if (s['type-check'])  d.typecheckCmd = 'npm run type-check';
      else if (s['tsc'])         d.typecheckCmd = 'npm run tsc';

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const isTs = deps.typescript || existsSync(join(cwd, 'tsconfig.json'));

      if (!d.typecheckCmd && isTs) d.typecheckCmd = 'npx tsc --noEmit';

      // Framework detection
      if (deps.next)           d.language = isTs ? 'TypeScript (Next.js)'  : 'JavaScript (Next.js)';
      else if (deps.nuxt)      d.language = isTs ? 'TypeScript (Nuxt)'     : 'JavaScript (Nuxt)';
      else if (deps.react)     d.language = isTs ? 'TypeScript (React)'    : 'JavaScript (React)';
      else if (deps.vue)       d.language = isTs ? 'TypeScript (Vue)'      : 'JavaScript (Vue)';
      else if (deps.svelte)    d.language = isTs ? 'TypeScript (Svelte)'   : 'JavaScript (Svelte)';
      else if (deps.express)   d.language = isTs ? 'TypeScript (Express)'  : 'JavaScript (Express)';
      else if (deps.fastify)   d.language = isTs ? 'TypeScript (Fastify)'  : 'JavaScript (Fastify)';
      else if (deps.nestjs || deps['@nestjs/core']) d.language = 'TypeScript (NestJS)';
      else                     d.language = isTs ? 'TypeScript'            : 'JavaScript (Node.js)';
    }
  }

  // Python
  const hasPyproject = existsSync(join(cwd, 'pyproject.toml'));
  const hasRequirements = existsSync(join(cwd, 'requirements.txt'));
  const hasSetupPy = existsSync(join(cwd, 'setup.py'));
  if (hasPyproject || hasRequirements || hasSetupPy) {
    const src = hasPyproject ? 'pyproject.toml' : hasSetupPy ? 'setup.py' : 'requirements.txt';
    d.sources.push(src);
    d.language     = 'Python';
    d.testCmd      = 'pytest';
    d.lintCmd      = 'ruff check .';
    d.typecheckCmd = 'mypy .';
    d.buildCmd     = '';
    d.devCmd       = 'python main.py';
    if (!d.projectName || d.projectName === basename(process.cwd())) {
      const pyproj = hasPyproject ? readFileSync(join(cwd, 'pyproject.toml'), 'utf8') : '';
      const m = pyproj.match(/name\s*=\s*"([^"]+)"/);
      if (m) d.projectName = m[1];
    }
  }

  // Rust
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    d.sources.push('Cargo.toml');
    const cargo = readFileSync(join(cwd, 'Cargo.toml'), 'utf8');
    const m = cargo.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m) d.projectName = m[1];
    d.language     = 'Rust';
    d.testCmd      = 'cargo test';
    d.lintCmd      = 'cargo clippy';
    d.typecheckCmd = 'cargo check';
    d.buildCmd     = 'cargo build --release';
    d.devCmd       = 'cargo run';
  }

  // Go
  if (existsSync(join(cwd, 'go.mod'))) {
    d.sources.push('go.mod');
    const gomod = readFileSync(join(cwd, 'go.mod'), 'utf8');
    const m = gomod.match(/^module\s+(\S+)/m);
    if (m) d.projectName = basename(m[1]);
    d.language     = 'Go';
    d.testCmd      = 'go test ./...';
    d.lintCmd      = 'golangci-lint run';
    d.typecheckCmd = 'go vet ./...';
    d.buildCmd     = 'go build ./...';
    d.devCmd       = 'go run .';
  }

  // Java — Maven
  if (existsSync(join(cwd, 'pom.xml'))) {
    d.sources.push('pom.xml');
    d.language     = 'Java (Maven)';
    d.testCmd      = 'mvn test';
    d.lintCmd      = 'mvn checkstyle:check';
    d.typecheckCmd = 'mvn compile -q';
    d.buildCmd     = 'mvn package -DskipTests';
    d.devCmd       = 'mvn spring-boot:run';
  }

  // Kotlin / Java — Gradle
  const gradleKts = existsSync(join(cwd, 'build.gradle.kts'));
  const gradleGroovy = existsSync(join(cwd, 'build.gradle'));
  if (gradleKts || gradleGroovy) {
    d.sources.push(gradleKts ? 'build.gradle.kts' : 'build.gradle');
    d.language     = gradleKts ? 'Kotlin (Gradle)' : 'Java (Gradle)';
    d.testCmd      = './gradlew test';
    d.lintCmd      = gradleKts ? './gradlew ktlintCheck' : './gradlew checkstyleMain';
    d.typecheckCmd = './gradlew compileKotlin';
    d.buildCmd     = './gradlew build';
    d.devCmd       = './gradlew bootRun';
  }

  return d;
}

export async function init() {
  if (existsSync(STATE_FILE)) {
    console.error('이미 초기화된 프로젝트입니다. (.harness/state.json 존재)');
    process.exit(1);
  }

  process.stdout.write('\n프로젝트 분석 중...');
  const detected = detectProject();
  process.stdout.write(' 완료\n\n');

  if (detected.sources.length > 0) {
    console.log(`감지된 파일: ${detected.sources.join(', ')}`);
    console.log(`감지된 언어: ${detected.language || '(알 수 없음)'}\n`);
  } else {
    console.log('프로젝트 파일을 감지하지 못했습니다. 직접 입력해 주세요.\n');
  }

  console.log('Enter를 누르면 감지된 값을 사용합니다.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const projectName  = await ask(rl, '프로젝트 이름',        detected.projectName  || 'my-project');
  const language     = await ask(rl, '주 언어/프레임워크',   detected.language     || 'TypeScript');
  const testCmd      = await ask(rl, '테스트 명령어',         detected.testCmd      || 'npm test');
  const lintCmd      = await ask(rl, '린트 명령어',           detected.lintCmd      || 'npm run lint');
  const typecheckCmd = await ask(rl, '타입체크 명령어',       detected.typecheckCmd || '');
  const buildCmd     = await ask(rl, '빌드 명령어',           detected.buildCmd     || 'npm run build');
  const devCmd       = await ask(rl, '개발 서버 명령어',      detected.devCmd       || 'npm run dev');
  const maxRetries   = parseInt(await ask(rl, '스테이지 최대 재시도 횟수', '3'), 10);
  rl.close();

  const config = { projectName, language, testCmd, lintCmd, typecheckCmd, buildCmd, devCmd };

  mkdirSync(join(HARNESS_DIR, 'agents'),         { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'validators'),      { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'skills'),          { recursive: true });
  mkdirSync(join(HARNESS_DIR, 'retrospectives'),  { recursive: true });

  copyDir(join(TEMPLATES_DIR, 'agents'),     join(HARNESS_DIR, 'agents'));
  copyDir(join(TEMPLATES_DIR, 'validators'), join(HARNESS_DIR, 'validators'));

  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');

  const state = { ...initialState(), maxRetries };
  writeState(state);

  const claudeTemplate = readFileSync(join(TEMPLATES_DIR, 'CLAUDE.md'), 'utf8');
  writeFileSync('CLAUDE.md', claudeTemplate.replace(/\[PROJECT_NAME\]/g, projectName), 'utf8');

  console.log(`
초기화 완료: ${projectName}

생성된 파일:
  .harness/config.json
  .harness/state.json
  .harness/agents/     (에이전트 지침 5개)
  .harness/validators/ (검증 기준 4개)
  CLAUDE.md

다음 단계:
  harness status   상태 확인
  harness run      요구사항 수집 에이전트 시작
`);
}
