import { stdin, stdout } from 'node:process';

/**
 * Reads a secret from an interactive terminal without echoing it. Refuses to
 * run when stdin is not a TTY so passwords are never piped through argv,
 * environment variables, or shell history.
 */
export async function promptHidden(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Jalankan perintah ini dari terminal interaktif agar password tidak diekspos.');
  }
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (buffer: Buffer) => {
      const key = buffer.toString('utf8');
      if (key === '\u0003') {
        stdin.setRawMode(false);
        stdin.off('data', onData);
        reject(new Error('Dibatalkan.'));
      } else if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else if (key.length === 1) {
        value += key;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}
