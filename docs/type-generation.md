# Backend/Frontend Type Synchronization

To maintain type safety and prevent drift between the Rust backend and the TypeScript frontend, this project uses [`ts-rs`](https://github.com/Aleph-Alpha/ts-rs) to automatically generate TypeScript types from Rust structs.

## How It Works

1.  **Defining Shared Types**: In the Rust codebase, any struct or enum that needs to be accessed by the frontend is decorated with the `#[derive(TS)]` macro.

    ```rust
    // Example from crates/server/src/routes/task_attempts.rs
    use ts_rs::TS;

    #[derive(Debug, Clone, Serialize, Deserialize, TS)]
    pub struct FileStatusEntry {
        pub staged: String,
        pub unstaged: String,
        pub path: String,
        pub orig_path: Option<String>,
        pub is_untracked: bool,
    }
    ```

2.  **Type Generation Script**: A dedicated Rust binary at `crates/server/src/bin/generate_types.rs` is responsible for collecting all the shared types and generating a single TypeScript file. It explicitly lists all the types to be exported.

3.  **Running the Script**: The type generation process is managed through npm scripts defined in the root `package.json`:
    *   `npm run generate-types`: This command compiles and runs the `generate_types` binary. It overwrites the `shared/types.ts` file with the newly generated TypeScript definitions.
    *   `npm run generate-types:check`: This command runs the generation script in a "check" mode. It compares the currently generated types with the version on disk and fails if there is a mismatch. This is used in the CI pipeline to ensure that any changes to Rust types are reflected in the frontend and that the generated files are committed.

## Benefits of This Approach

*   **Single Source of Truth**: The Rust code is the single source of truth for data structures.
*   **Type Safety**: Prevents runtime errors caused by inconsistencies between backend and frontend models.
*   **Reduced Boilerplate**: Eliminates the need to manually write and maintain duplicate type definitions in TypeScript.
*   **Automated and Verifiable**: The process is easily automated and can be enforced in CI, preventing outdated types from being merged.
