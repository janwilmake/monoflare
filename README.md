# Monoflare - The Monorepo for Cloudflare Microservices

> [!IMPORTANT]
> This is currently just a WIP and isn't functional yet

Problem: serverless and workers are great but require too much config to spin up a domain somewhere.

Main idea: a compiler that turns a single file to a folder with that file and all configurations needed to deploy a website/api on cloudflare.

The dream: ultimately, a single readme with the domain as the filename should be enough to create a new service. A single repo can become 100 deployments.

![](idea.drawio.svg)

# POC

- ✅ create a local script that turns all ts files into a folder in a build folder. no shadowbranches shit (for now)
- ✅ root package.json and tsconfig.json are ignored
- ✅ each typescript file will be the folder in the build folder
- ✅ if the filename or folder seems like domain (e.g. `uithub.cf.ts`, since we have that domain) it will be used as the route.
- ✅ tsconfig.json will be added automatically as well as .gitignore, .assetsignore, etc
- ✅ if there's a folder that matches a domain, that will be placed in the folder too and it will become public
- ✅ wrapper (e.g. ratelimiter or authlayer) can be in between. part of template
- Deploy on `monoflare.cloud`
- Test the API to return deployments
- Domains need to be extracted from cloudflare via API
- Make multipatch actually work!
- Build should happen from cloudflare worker. using `uithub` and `forgithub.push`
- Deployment should happen in an individual repo or branch per deployment, because the build step can take a while and we want visibility. Also for other reasons (such as exposure) we want separate repos.

Now we have one-file workers with automatic domains!

# High prio

Parsing the file

- if the file has imported packages, they will be added to package.json
- SIMPLER: if the file exports `const wrangler` it will be used as base for `wrangler.toml`.
- HARDER: all cloudflare apis are just available. they just work by changing your `type Env` and the build should take care of it.
- the top comment will become the README.md
- relative imports are copied over to the individual deployments so we don't need dependency version hell

# Wishlist

- nlang functionality:
  - generate fetch handler logic from regular functions, just using domain-name filenames that don't have it as candidates for this.
  - openapi is very useful
- cross-cloud! allow vercel & deno too, and bun if possible. choose most logical one. cross language too!
- environment variables get set automatically, directly to cloudflare worker, based on single central secrets repo
