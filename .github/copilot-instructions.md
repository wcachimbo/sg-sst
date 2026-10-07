# SG-SST Platform

- This project uses React with JavaScript and Vite. Keep examples approachable for people new to React.
- Build a Spanish-language occupational safety and health management platform (SG-SST).
- Keep every page usable on mobile and desktop; use the existing CSS approach unless a dependency is clearly needed.
- Companies in `public.empresa` are persisted through Supabase when `.env.local`, Supabase Auth, and the RLS policies are configured. Other lists remain demonstration data in React state.
- Use only the Supabase publishable key in the browser. Never expose the `service_role` key or describe demo records as persistent.
- Initial company RLS policies allow only the authenticated `admin@gmail.com` account; do not broaden access without designing tenant-scoped roles and policies.
- Run `npm run build` and `npm run lint` after meaningful code changes.
