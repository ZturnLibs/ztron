/*
 * ztron-launcher.c — signed-friendly macOS app launcher (Mach-O, not sh).
 *
 * Replaces the POSIX-shell launcher inside .app bundles:
 *   1. spawn ./ztron-host 0 (GUI/webview process), log to Resources/.host.log
 *   2. poll the log for PORT=<n>
 *   3. exec ./ztron-backend with ZTRON_HOST/ZTRON_HOST_PORT/
 *      ZTRON_INVOKE_KEY/ZTRON_DEV_URL env, wait, then kill the host
 *
 * A Mach-O main executable is required for codesign strict validation
 * (a shell-script CFBundleExecutable leaves the bundle un-signable).
 * Invoke-key / frontend URL are baked in at build time via -D flags.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <spawn.h>
#include <sys/wait.h>
#include <signal.h>

#ifndef ZTRON_INVOKE_KEY
#define ZTRON_INVOKE_KEY "dev"
#endif

extern char **environ;

int main(void) {
  char dir[4096];
  uint32_t size = sizeof(dir);
  if (_NSGetExecutablePath(dir, &size) != 0) return 1;
  /* strip "/ztron" -> directory of this executable */
  char *slash = strrchr(dir, '/');
  if (!slash) return 1;
  *slash = '\0';
  const char *macos_dir = dir;

  char res[4096], host_log[4096], host_bin[4096], backend_bin[4096];
  snprintf(res, sizeof(res), "%s/../Resources", macos_dir);
  snprintf(host_log, sizeof(host_log), "%s/.host.log", res);
  snprintf(host_bin, sizeof(host_bin), "%s/ztron-host", macos_dir);
  /* the backend lives in Resources: tjs-compiled binaries fail codesign
     strict validation, and nested resources are not part of the app's main
     signature chain (the launcher spawns it from there). */
  snprintf(backend_bin, sizeof(backend_bin), "%s/ztron-backend", res);

  /* start the host with stdout redirected to the log */
  int log_fd = open(host_log, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (log_fd < 0) return 1;
  posix_spawn_file_actions_t fa;
  posix_spawn_file_actions_init(&fa);
  posix_spawn_file_actions_adddup2(&fa, log_fd, STDOUT_FILENO);
  pid_t host_pid;
  char *const host_argv[] = {(char *)host_bin, (char *)"0", NULL};
  if (posix_spawn(&host_pid, host_bin, &fa, NULL, host_argv, environ) != 0) {
    fprintf(stderr, "ztron: failed to spawn host\n");
    return 1;
  }
  posix_spawn_file_actions_destroy(&fa);
  close(log_fd);

  /* poll for PORT= in the log (up to ~10s) */
  char port[16] = "";
  for (int i = 0; i < 100 && !port[0]; i++) {
    usleep(100 * 1000);
    FILE *f = fopen(host_log, "r");
    if (!f) continue;
    char line[128];
    while (fgets(line, sizeof(line), f)) {
      if (strncmp(line, "PORT=", 5) == 0) {
        snprintf(port, sizeof(port), "%s", line + 5);
        char *nl = strchr(port, '\n');
        if (nl) *nl = '\0';
        break;
      }
    }
    fclose(f);
  }
  if (!port[0]) {
    fprintf(stderr, "ztron: host failed to start\n");
    kill(host_pid, SIGKILL);
    return 1;
  }

  char env_host[] = "ZTRON_HOST=127.0.0.1";
  char env_port[64];
  snprintf(env_port, sizeof(env_port), "ZTRON_HOST_PORT=%s", port);
  char env_key[512];
  snprintf(env_key, sizeof(env_key), "ZTRON_INVOKE_KEY=%s", ZTRON_INVOKE_KEY);
  char env_url[4352];
  snprintf(env_url, sizeof(env_url),
           "ZTRON_DEV_URL=file://%s/frontend/index.html", res);

  char *const be_argv[] = {(char *)backend_bin, NULL};
  char *const be_envp[] = {env_host, env_port, env_key, env_url, NULL};
  int status = 0;
  pid_t be_pid;
  if (posix_spawn(&be_pid, backend_bin, NULL, NULL, be_argv, be_envp) == 0) {
    waitpid(be_pid, &status, 0);
  }
  kill(host_pid, SIGKILL);
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
