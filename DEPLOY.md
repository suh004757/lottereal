# Deployment Guidelines

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
- jQuery has been upgraded to v3.7.1 for better security.
- Please verify all interactive elements (sliders, maps, popups) function correctly.
