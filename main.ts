const DEFAULT_TEMPLATE = "janwilmake/monoflare.template";
/** Type for monoflare.json file in the monorepo to configure settings */
type ConfigType = {
  targetOwner?: string;
  secretsRepo?: string;
  templateRepo?: string;
};

type PackageJson = {
  dependencies: { [name: string]: string };
  devDependencies: { [name: string]: string };
};

type FileObject = {
  [path: string]: {
    type: string;
    content?: string;
    url?: string;
    imports?: { [module: string]: string[] };
    /** TODO zipobject */
    defaultExport?: string[];
    /** TODO zipobject */
    mainComment?: string;
  };
};

type BuildResult = {
  owner: string;
  repo: string;
  branch: string;
  isPrivate?: boolean;
  deploymentName: string;
  files: FileObject;
  secrets?: { [key: string]: string };
};

type PatchResult = {
  owner: string;
  repo: string;
  branch: string;
  isUpdated: boolean;
  diff: string;
};

const parseFile = (path: string) => {
  const folders = path.split("/");
  const filename = folders.pop()!;
  const filenameChunks = filename.split(".");
  const ext = filenameChunks.pop()!;
  const folder = folders.join("/");
  const name = filenameChunks.join(".");
  const id = filenameChunks[0] as string | undefined;
  const firstFolder = folders[1] as string | undefined;
  return {
    firstFolder,
    folder,
    name,
    ext,
    id,
  };
};

/**
 * This monoflare build transforms a fileObject from a single repo into multiple file objects in several repos.
 *
 * This is done by transforming to a FileObject where every file path is prefixed with `/owner/repo/tree/branch/`
 */
const build = (context: {
  files: { files: FileObject };
  template: { files: FileObject };
  /** The domains available in your cloudflare */
  domains: string[];
  /** owner where the build is going */
  targetOwner: string;
  isPrivate?: boolean;
  /** branch where the build is going */
  targetBranch: string;
  packageJson?: PackageJson;
  secrets?: { [key: string]: string };
}): BuildResult[] => {
  const {
    domains,
    files,
    targetBranch,
    targetOwner,
    template,
    packageJson,
    isPrivate,
  } = context;

  const domainIds = Array.from(
    new Set(
      domains.map((domain) => {
        const chunks = domain.split(".").reverse();

        // we don't care about the tld, assuming you won't have multiple TLDs for the same domain (having that would require custom configuration)
        chunks.shift();

        return chunks.join(".");
      }),
    ),
  );

  const newFiles = Object.keys(files.files)
    .map((path) => {
      const file = files.files[path];

      const parse = parseFile(path);

      // 1) CHECK FOR FILENAMES FIRST
      const matchFileId = domainIds.find(
        (id) => parse.id === id || parse.id?.startsWith(id + "."),
      );

      if (matchFileId) {
        // we have a matching file to a domain
        const newFilename =
          parse.ext === "html"
            ? "index.html"
            : parse.ext === "md"
            ? "README.md"
            : parse.ext === "ts"
            ? "index.ts"
            : "index." + parse.ext;

        const newPath = `/${newFilename}`;
        return { newPath, file, routeId: parse.id! };
      }

      // THEN CHECK FOR FOLDERNAMES
      const matchFolderId = domainIds.find(
        (id) =>
          parse.firstFolder === id || parse.firstFolder?.startsWith(id + "."),
      );

      if (matchFolderId) {
        const withoutFolder = "/" + path.split("/").slice(2).join("/");
        const newPath = withoutFolder;
        return { newPath, file, routeId: parse.firstFolder! };
      }
    })
    .filter((x) => !!x);

  // Now, we know the routeIds so we should add the templates
  const routeIds = Array.from(new Set(newFiles.map((x) => x.routeId)));

  const buildResults = routeIds.map((routeId) => {
    const deploymentName = "monoflare_" + routeId.replaceAll(".", "_");
    const baseFileEntries = newFiles
      .filter((x) => x.routeId === routeId)
      .map((x) => [x.newPath, x.file] as [string, any]);

    const templateFileEntries = Object.keys(template.files)
      .map((path) => {
        const file = template.files[path];
        const newPath = path.replace(".github.template", ".github");
        const segments = routeId.split(".");
        const firstDomain = domains.find(
          (domain) => domain.startsWith(segments[0]) + ".",
        );

        if (!firstDomain) {
          // must be a domain for it!
          return;
        }

        const newContent = file.content
          ?.replaceAll("__TEMPLATE_DOMAIN__", firstDomain)
          .replaceAll("__TEMPLATE_NAME__", deploymentName)
          .replaceAll("__TEMPLATE_OWNER__", targetOwner);

        return [newPath, { ...file, content: newContent }] as [string, any];
      })
      .filter((x) => !!x);

    // merge template with base files found,
    // overwriting template files if they exist in the base
    const files = Object.assign(
      Object.fromEntries(templateFileEntries),
      Object.fromEntries(baseFileEntries),
    );

    return {
      deploymentName,
      branch: targetBranch,
      owner: targetOwner,
      repo: routeId,
      isPrivate,
      files,
    } satisfies BuildResult;
  });

  return buildResults;
};

const multipatch = (builds: BuildResult[]): PatchResult[] => {
  // use cloudflare secrets to directly update secrets (preferably, only if changed, if that can be seen)

  // use forgithub.patch for each build

  return [];
};

export default {
  fetch: async (request: Request) => {
    const url = new URL(request.url);
    // signal that this monorepo has been updated at this branch.
    const [owner, repo, _, branch] = url.pathname.split("/").slice(1);

    const apiKey =
      url.searchParams.get("apiKey") ||
      request.headers.get("Authorization"?.slice("Bearer ".length));

    if (!apiKey) {
      return new Response("Unauthorized", { status: 401 });
    }

    const monorepo = await fetch(
      `https://zipobject.com/github.com/${owner}/${repo}/tree/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!monorepo.ok) {
      return new Response("Couldn't find repo", { status: 404 });
    }

    const monorepoFiles = await monorepo.json();

    const config = monorepoFiles.files["/monoflare.json"]?.content
      ? (JSON.parse(
          monorepoFiles.files["/monoflare.json"]?.content,
        ) as ConfigType)
      : undefined;

    const packageJson = monorepoFiles.files["/package.json"]?.content
      ? (JSON.parse(
          monorepoFiles.files["/package.json"]?.content,
        ) as PackageJson)
      : undefined;

    const [templateOwner, templateRepo] = (
      config?.templateRepo || DEFAULT_TEMPLATE
    ).split("/");

    if (!templateOwner || !templateRepo) {
      return new Response("Invalid template configuration", { status: 400 });
    }

    const template = await fetch(
      `https://zipobject.com/github.com/${templateOwner}/${templateRepo}`,
      {
        headers:
          templateOwner.toLowerCase() === owner.toLowerCase()
            ? { Authorization: `Bearer ${apiKey}` }
            : undefined,
      },
    );
    if (!template.ok) {
      return new Response("Couldn't find template repo", { status: 404 });
    }
    const templateFiles = await template.json();

    let secretFiles: { files: FileObject } | undefined = undefined;
    if (
      config?.secretsRepo &&
      config.secretsRepo.split("/")[0].toLowerCase() === owner.toLowerCase()
    ) {
      const secrets = await fetch(
        `https://zipobject.com/github.com/${config.secretsRepo}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!secrets.ok) {
        return new Response("Couldn't find secrets", { status: 404 });
      }
      secretFiles = await secrets.json();
    }

    // TODO: Domains need to be extracted from cloudflare via API
    const domains = await ["wilmake.com", "monoflare.cloud"];

    // TODO: select .env.[branch] file or .env.preview for other branches, or just .env if that's all that's there
    // const secretsFile: string = "";
    // TODO: get from the relevant secrets file
    const secrets = {};

    const results = build({
      domains,
      files: monorepoFiles,
      template: templateFiles,
      targetBranch: branch,
      targetOwner: config?.targetOwner || owner,
      packageJson,
      secrets,
    });

    // TODO: use multipatch.forgithub to be able to push to which ever repo has changed
    const patches = await multipatch(results);

    return new Response(
      JSON.stringify(
        { message: "Deployments initiated", results, patches },
        undefined,
        2,
      ),
      { status: 202 },
    );
  },
};
