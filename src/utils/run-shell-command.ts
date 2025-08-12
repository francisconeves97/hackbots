const runShellCommand = async (cmd: string[]) => {
  const child = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await child.exited;

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();

  return {
    exitCode,
    stdout,
    stderr,
  };
};

export { runShellCommand };
