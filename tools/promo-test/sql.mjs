// synchronous SQL via Supabase Management API (curl)
import { execFileSync } from 'node:child_process';
export function sql(query) {
  for (let i = 0; ; i++) {
    try { return sqlOnce(query); } catch (e) {
      if (i >= 3 || !/upstream|not valid JSON|ECONN|timed out|Recv failure|reset by peer/i.test(String(e))) throw e;
      execFileSync('sleep', [String(2 ** i)]);
    }
  }
}
function sqlOnce(query) {
  const out = execFileSync('curl', ['-sS', '-X', 'POST', 'https://api.supabase.com/v1/projects/qotlepudmkuniyjvqmle/database/query',
    '-H', 'Content-Type: application/json', '--data-binary', '@-'], { input: JSON.stringify({ query }) }).toString();
  const j = JSON.parse(out);
  if (!Array.isArray(j)) throw new Error('SQL error: ' + out.slice(0, 400));
  return j;
}
export const lit = (v) => '$j$' + JSON.stringify(v) + '$j$';
