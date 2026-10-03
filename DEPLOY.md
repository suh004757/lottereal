# Deployment Guidelines

## GitHub Pages deployment boundary

Production is deployed by GitHub Actions from the `public/` artifact built with `scripts/build_pages_artifact.py`. The workflow preserves existing public relative paths while excluding repository-only source and operations directories: `scripts/`, `tests/`, `supabase/`, `content/`, `scss/`.

The deployment workflow runs the Python and Node regression suites, builds the artifact outside the checkout, and uploads only that artifact. It does not use repository secrets. Roll back the deployment mechanism by reverting the workflow commit and changing the Pages build type back to the `main /` legacy source.

## Security Checklist
Before deploying or zipping this project for distribution, please ensure the following:

### 1. Exclude Version Control Files
Do NOT include the `.git/` folder or `.gitignore`, `.gitattributes` files in your public Zip archives or web server deployment.
- The `.git/` folder contains the entire history of the project and can reveal sensitive information or deleted files.
- If using a build script, ensure it excludes `.git`.
- If zipping manually, select all files *except* the `.git` folder.

### 2. Sensitive Keys
- The Google Maps API Key has been removed from `contact.html` and `contact_EN.html` to prevent misuse. 
- If you need to re-enable Google Maps:
    1. Generate a new API Key in Google Cloud Console.
    2. Apply **HTTP Referrer Restrictions** (e.g., `https://lottes.co.kr/*`) to the key so it cannot be used elsewhere.
    3. Add the key back to the script tag in the HTML files only when ready to deploy, or use environment variables if moving to a build system.

### 3. Personal Information
- Personal emails/IDs have been removed from `contact_EN.html`.
- Use `admin@lottes.co.kr` for all public inquiries.

## Updates
- Removed the unused jQuery, `active.js`, and `plugins.js` runtime chain.
- Application pages enforce public/admin-specific meta CSP and referrer policies.
- `scripts/maintenance_check.py` verifies CSP placement, inline-script/event-handler bans, pinned vendor hashes, and the approved Supabase CDN URL.
- Run the full Python/Node suites, maintenance check, and browser smoke tests before publishing.
