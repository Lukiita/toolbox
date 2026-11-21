// The skills on disk: the running package's `skills/` and the project's
// `.agents/skills/`, behind the port the two commands use. Everything about
// paths is here; the use cases only name a skill.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS_DIR } from "../application/skill-layout.mjs";
import { readShippedSkillTree, readSkillTree, recoverSkillFolder, shippedSkills, skillLinkKind, writeSkillTree, } from "./skill-directory.mjs";
import { readSkillManifest, writeSkillManifest } from "./skill-manifest-file.mjs";
export class DiskSkillFolders {
    packageDir;
    projectRoot;
    /**
     * @example
     *   new DiskSkillFolders({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
     */
    constructor({ packageDir, projectRoot }) {
        this.packageDir = packageDir;
        this.projectRoot = projectRoot;
    }
    paths(name) {
        return {
            local: join(this.projectRoot, SKILLS_DIR, name),
            shipped: join(this.packageDir, 'skills', name),
        };
    }
    shipped() {
        return shippedSkills(this.packageDir);
    }
    readShipped(name) {
        return readShippedSkillTree(this.paths(name).shipped);
    }
    readLocal(name) {
        return readSkillTree(this.paths(name).local);
    }
    writeLocal(name, tree) {
        return writeSkillTree(this.paths(name).local, tree);
    }
    linkKind(name) {
        return skillLinkKind(this.paths(name).local, this.packageDir);
    }
    // `rmSync` without `recursive` unlinks the link and leaves its target alone.
    removeLink(name) {
        rmSync(this.paths(name).local);
    }
    recover(name) {
        recoverSkillFolder(this.paths(name).local);
    }
    readManifest() {
        return readSkillManifest(this.projectRoot);
    }
    saveManifest(manifest) {
        writeSkillManifest(this.projectRoot, manifest);
    }
}
