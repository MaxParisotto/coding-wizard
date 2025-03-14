export const store_code_snippet_schema = {
  type: "object",
  properties: {
    code: { type: "string", description: "The code snippet." },
    language: { type: "string", default: "Rust", description: "The programming language of the code snippet (default: Rust)." },
    description: { type: "string", description: "A brief description or context of the code snippet." },
    source: { type: "string", description: "Where the code snippet was sourced from." },
    tags: { type: "array", items: { type: "string" }, description: "Keywords or tags to help with searching." }
  },
  required: ["code"]
};

export const store_dependency_schema = {
  type: "object",
  properties: {
    dependency_name: { type: "string", description: "The name of the dependency." },
    version: { type: "string", description: "The version of the dependency." },
    repository_url: { type: "string", description: "URL to the dependency’s repository if available." },
    description: { type: "string", description: "A brief description of what the dependency does." }
  },
  required: ["dependency_name", "version"]
};

export const store_crate_documentation_schema = {
  type: "object",
  properties: {
    crate_name: { type: "string", description: "The name of the crate." },
    documentation_url: { type: "string", description: "URL to the crate’s documentation." },
    version: { type: "string", description: "Version of the crate." },
    repository_url: { type: "string", description: "URL to the crate’s repository if available." }
  },
  required: ["crate_name", "documentation_url"]
};

export const search_code_snippets_schema = {
  type: "object",
  properties: {
    query: { type: "string", description: "The search query (e.g., a keyword or tag)." }
  },
  required: ["query"]
};

export const get_crate_documentation_schema = {
  type: "object",
  properties: {
    crate_name: { type: "string", description: "The name of the crate." }
  },
  required: ["crate_name"]
};

export const code_review_schema = {
  type: "object",
  properties: {
    code: { type: "string", description: "The Rust code to review." }
  },
  required: ["code"]
};
