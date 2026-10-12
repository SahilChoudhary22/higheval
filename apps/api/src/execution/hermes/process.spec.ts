import { runProcess } from './process.js';

const node = process.execPath;

function run(script: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  let stdout = '';
  let stderr = '';
  return runProcess(
    { command: node, args: ['-e', script], cwd: process.cwd(), env: { PATH: process.env.PATH } },
    { onStdout: (chunk) => (stdout += chunk), onStderr: (chunk) => (stderr += chunk) },
    {
      signal: options.signal ?? new AbortController().signal,
      hardTimeoutMs: options.timeoutMs ?? 10_000,
    },
  ).then((result) => ({ ...result, stdout, stderr }));
}

describe('runProcess', () => {
  it('streams stdout/stderr and reports the exit code', async () => {
    const result = await run(
      'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
    );
    expect(result).toMatchObject({ exitCode: 3, stdout: 'out', stderr: 'err', stoppedBy: null });
  });

  it('passes arguments verbatim without a shell', async () => {
    let stdout = '';
    await runProcess(
      {
        command: node,
        args: ['-e', 'process.stdout.write(process.argv[1])', '$(echo pwned) `id`'],
        cwd: process.cwd(),
        env: {},
      },
      { onStdout: (chunk) => (stdout += chunk), onStderr: () => undefined },
      { signal: new AbortController().signal, hardTimeoutMs: 10_000 },
    );
    expect(stdout).toBe('$(echo pwned) `id`');
  });

  it('kills the process group at the hard deadline', async () => {
    const result = await run('setInterval(() => {}, 1000)', { timeoutMs: 200 });
    expect(result.stoppedBy).toBe('timeout');
    expect(result.signal).toBe('SIGTERM');
  });

  it('stops on abort', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const result = await run('setInterval(() => {}, 1000)', { signal: controller.signal });
    expect(result.stoppedBy).toBe('abort');
  });

  it('reports spawn failures', async () => {
    const result = await runProcess(
      { command: '/nonexistent/binary', args: [], cwd: process.cwd(), env: {} },
      { onStdout: () => undefined, onStderr: () => undefined },
      { signal: new AbortController().signal, hardTimeoutMs: 1_000 },
    );
    expect(result.spawnError).toBeInstanceOf(Error);
  });
});
