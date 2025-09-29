# Secret Sharing Guide for Beginners

## What Are "Secrets" in Software Development?

**Secrets** are sensitive pieces of information that your application needs to work, but should never be visible to the public:
- API keys (like your UDoT traffic API key)
- Database passwords
- Authentication tokens
- Encryption keys

Think of them like house keys - you need them to get in, but you don't want to leave them lying around for anyone to find.

## The Problem We're Solving

**❌ BAD - What NOT to do:**
```javascript
// Never do this! This key is now visible to everyone
const udotApiKey = "abc123-secret-key-xyz789";
```

**✅ GOOD - What we do instead:**
```javascript
// The key comes from a secure environment variable
const udotApiKey = process.env.UDOT_API_KEY;
```

## Our Team's Secret Management System

### 1. Environment Variables (.env files)

**What they are:** Special files that store secrets locally on each person's computer.

**How it works:**
- Each team member has their own `.env` file (never shared in git)
- Contains real API keys and passwords
- Application reads secrets from this file

**Example `.env` file:**
```
UDOT_API_KEY=your_real_api_key_here
DATA_UPLOAD_API_KEY=your_upload_key_here
```

### 2. The .env.example Template

**What it is:** A template showing what secrets are needed, but with fake values.

**Why we need it:**
- Shows new team members what secrets they need
- Can be safely committed to git (no real secrets)
- Acts as documentation

**Example `.env.example`:**
```
UDOT_API_KEY=your_udot_api_key_here
DATA_UPLOAD_API_KEY=your_upload_key_here
```

### 3. Team Secret Sharing

**The Challenge:** How do team members get the real API keys?

**Our Solutions (pick one):**

#### Option A: Password Manager (Recommended)
- **Tools:** 1Password, Bitwarden, Dashlane
- **How:** Create shared vault, store all API keys there
- **Pros:** Secure, easy to use, automatic updates
- **Cost:** ~$3-8/month per person

#### Option B: Secure Messaging
- **Tools:** Signal, encrypted email, Slack DMs
- **How:** Send keys privately to each team member
- **Pros:** Free, simple
- **Cons:** Keys can get out of sync, less secure

#### Option C: Cloud Secret Management (Advanced)
- **Tools:** AWS Secrets Manager, Azure Key Vault
- **How:** Store secrets in cloud, application pulls them automatically
- **Pros:** Very secure, automatic rotation
- **Cons:** More complex setup, requires cloud knowledge

## Step-by-Step Setup for New Team Members

### For the First Person (Setting up)
1. Get API keys from providers (UDoT, Synoptic Weather, etc.)
2. Copy `.env.example` to `.env`: `cp .env.example .env`
3. Fill in real values in `.env`
4. Share the real values securely with team (using password manager)

### For New Team Members (Joining)
1. Clone the repository
2. Copy the template: `cp .env.example .env`
3. Get real API keys from team lead (via password manager/secure method)
4. Fill in your `.env` file with real values
5. Test that application works

## Security Rules (NEVER Break These!)

### ❌ Never Do This:
- Commit `.env` files to git
- Share API keys in Slack/Discord public channels
- Email API keys in plain text
- Put real keys in code comments
- Screenshot API keys

### ✅ Always Do This:
- Keep `.env` files local only
- Use secure sharing methods
- Rotate keys if they're compromised
- Tell team immediately if you accidentally expose a key

## What Happens in Different Environments

### Local Development (Your Computer)
- Uses `.env` file with real keys
- Only you can see these keys
- Never committed to git

### Production Server (Live Website)
- Environment variables set directly on server
- No `.env` files in production
- Keys managed by hosting platform (Heroku, AWS, etc.)

### Testing/Staging
- Separate set of test API keys
- Same process, different values
- Keeps production keys safe

## Troubleshooting Common Issues

**"My application says API key is missing"**
- Check if `.env` file exists in project root
- Verify the key name matches exactly (case-sensitive)
- Make sure you copied from `.env.example`

**"I accidentally committed my .env file"**
- Remove it from git immediately: `git rm --cached .env`
- Rotate all API keys in that file
- Add `.env` to `.gitignore` (should already be there)

**"Team member can't access the API keys"**
- Verify they're in the password manager vault
- Check they have the right permissions
- Make sure they copied `.env.example` correctly

## Quick Reference Commands

```bash
# Copy the template (first time setup)
cp .env.example .env

# Check if .env is being ignored by git (should show nothing)
git status .env

# Test if environment variables are loading
node -e "console.log(process.env.UDOT_API_KEY)"
```

## Why This Approach Works

1. **Secure:** Real secrets never leave secure systems
2. **Scalable:** Easy to add new team members
3. **Maintainable:** Clear process everyone follows
4. **Industry Standard:** Used by professional development teams
5. **Flexible:** Works for any size team or project

## Need Help?

- Check if `.env.example` exists and copy it
- Verify your password manager has the latest keys
- Ask team lead for access to shared vault
- Test with: `npm run dev` (should work without API errors)