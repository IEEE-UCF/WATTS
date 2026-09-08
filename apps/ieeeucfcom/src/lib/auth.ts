// App-local NextAuth options: @watts/auth builds them against our one Drizzle
// client. Kept at this path so every `import { authOptions } from '@/lib/auth'`
// (route handlers, tRPC context, RSC pages) is unchanged. The `Session` / `User`
// module augmentation lives in src/types/next-auth.d.ts.
import { buildAuthOptions } from '@watts/auth';
import { db } from '@/lib/database/client';

export const authOptions = buildAuthOptions(db);
