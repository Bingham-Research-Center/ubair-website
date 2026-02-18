# Python Packaging and Deployment Guide

**For:** BRC Projects (brc-tools, clyfar, ubair-website)
**Audience:** Python developers new to packaging/deployment
**Date:** 2025-11-22

---

## Table of Contents

1. [What is Python Packaging?](#what-is-python-packaging)
2. [The "Egg" and Editable Installs](#the-egg-and-editable-installs)
3. [Conda Environments vs pip](#conda-environments-vs-pip)
4. [How .env Files Fit In](#how-env-files-fit-in)
5. [Our Multi-Repo Architecture](#our-multi-repo-architecture)
6. [Step-by-Step Setup](#step-by-step-setup)
7. [Testing the Setup](#testing-the-setup)
8. [Deployment Checklist](#deployment-checklist)
9. [Troubleshooting](#troubleshooting)

---

## What is Python Packaging?

### The Problem

You have code in `brc-tools/brc_tools/download/push_data.py` and want to use it in `clyfar/`:

**Bad approach (what we were about to do):**
```python
# In clyfar code
sys.path.insert(0, '../../brc-tools')  # Hardcoded path - breaks everywhere!
from brc_tools.download.push_data import send_json_to_server
```

**Problems:**
- Only works on your machine with specific directory structure
- Breaks for teammates
- Breaks on CHPC
- Path hell when running as Slurm jobs

### The Solution: Packaging

Turn `brc-tools` into an installable Python package:

```bash
cd ~/brc-tools
pip install -e .
```

Now from **anywhere** (including clyfar):
```python
from brc_tools.download.push_data import send_json_to_server  # Just works!
```

**Why it works:**
- Python knows where `brc_tools` is installed
- No hardcoded paths
- Works on any machine (local, CHPC, teammate's laptop)

---

## The "Egg" and Editable Installs

### What's an "Egg"?

When you run `pip install -e .` in a package directory:

1. **Creates `brc_tools.egg-info/` directory** - metadata about the package
2. **Adds package to Python's import system** - Python now knows where to find it
3. **Does NOT copy files** - Points to your working directory

### Editable Install (`-e` flag)

**Editable mode** means "install in development mode":

```bash
pip install -e /path/to/brc-tools
```

**What this does:**
- Links to your source code (doesn't copy)
- Changes you make to code are immediately available
- Perfect for packages still in development
- No need to reinstall after every change

**Without `-e` (production install):**
```bash
pip install /path/to/brc-tools
```
- Copies code to site-packages
- Changes to source don't affect installed version
- Need to reinstall to pick up changes

### When to Use Each

| Scenario | Command | Why |
|----------|---------|-----|
| Developing brc-tools | `pip install -e ~/brc-tools` | Changes immediately available |
| Using stable version | `pip install ~/brc-tools` | Immutable, predictable |
| Installing from GitHub | `pip install git+https://github.com/...` | Production deployment |

---

## Conda Environments vs pip

### Your Current Setup

```
brc-tools (conda env: brc-tools)
  - For downloading weather data
  - Runs directly on CHPC

clyfar (conda env: clyfar)
  - For ozone predictions
  - Runs as Slurm batch jobs
  - Separate environment for isolation
```

### Can Conda and pip Work Together?

**Yes!** This is normal and recommended:

```bash
# Create conda env with base scientific stack
conda create -n clyfar python=3.11.9
conda activate clyfar

# Use conda for big packages (better binary management)
conda install numpy pandas matplotlib

# Use pip for pure Python packages OR local editable installs
pip install requests
pip install -e ~/brc-tools  # This works!
```

**Key points:**
- Conda manages the environment
- pip installs packages INTO that conda environment
- `pip install -e` works perfectly in conda
- Both tools write to the same site-packages

### Our Strategy

**For brc-tools environment:**
```bash
conda activate brc-tools
# Install all its dependencies normally
pip install -r requirements.txt
# Or: conda install ... (whatever you prefer)
```

**For clyfar environment:**
```bash
conda activate clyfar
# Install clyfar's dependencies
pip install -r requirements.txt

# ALSO install brc-tools in editable mode
pip install -e ~/brc-tools

# Now clyfar can import from brc_tools!
```

---

## How .env Files Fit In

### What are .env Files?

`.env` files store **environment variables** - configuration that changes per deployment:

**Example `.env`:**
```bash
# API Keys (secrets)
DATA_UPLOAD_API_KEY=abc123xyz789
SYNOPTIC_API_TOKEN=my-token-here

# Configuration (non-secrets)
BASINWX_API_URL=https://basinwx.com
LOG_LEVEL=INFO
```

### The Pattern: .env vs .env.example

**Never commit secrets to git!**

```
.env              # Real secrets - IN .gitignore
.env.example      # Template - COMMITTED to git
```

**`.env.example` (committed to repo):**
```bash
# Copy this to .env and fill in your values

# Required: Website upload authentication
DATA_UPLOAD_API_KEY=your-key-here

# Required: Synoptic Weather API
SYNOPTIC_API_TOKEN=your-token-here

# Optional: Custom website URL
BASINWX_API_URL=https://basinwx.com
```

**`.env` (NOT in git, each user creates their own):**
```bash
DATA_UPLOAD_API_KEY=sk_live_abc123xyz789
SYNOPTIC_API_TOKEN=f7a3b9c1d2e4
BASINWX_API_URL=https://staging.basinwx.com  # Testing on staging
```

### Using .env in Python

**Install python-dotenv:**
```bash
pip install python-dotenv
```

**Load in your code:**
```python
from dotenv import load_dotenv
import os

# Load .env file from current directory or parent directories
load_dotenv()

# Now read environment variables
api_key = os.environ.get('DATA_UPLOAD_API_KEY')
if not api_key:
    raise ValueError("DATA_UPLOAD_API_KEY not set in .env")
```

**Where to call `load_dotenv()`:**
- **Script entry point** (e.g., top of `run_gefs_clyfar.py`)
- **NOT in library code** (e.g., don't put in `push_data.py`)
- **Once per process** (at the beginning)

### .env Workflow

**For new team member:**
1. Clone repo: `git clone ...`
2. Copy template: `cp .env.example .env`
3. Fill in secrets: `vim .env` (add real API keys)
4. Run code: `python script.py` (automatically loads .env)

**For deployment (CHPC):**
1. Create `~/.bashrc_basinwx` with secrets:
   ```bash
   export DATA_UPLOAD_API_KEY="..."
   export SYNOPTIC_API_TOKEN="..."
   ```
2. Source in `~/.bashrc`: `source ~/.bashrc_basinwx`
3. Scripts read from environment (no .env file needed)

**Why two methods?**
- **Local development:** `.env` file (easy to manage multiple projects)
- **Server deployment:** Shell RC file (persists across sessions, cron reads it)

### .env is a Checklist

You're right! `.env.example` serves as:

1. **Checklist** - "What secrets do I need?"
2. **Documentation** - Comments explain each variable
3. **Template** - Copy-paste and fill in
4. **Validation** - Scripts can check for required variables

**Example with validation:**
```python
from dotenv import load_dotenv
import os
import sys

load_dotenv()

REQUIRED_VARS = [
    'DATA_UPLOAD_API_KEY',
    'SYNOPTIC_API_TOKEN',
]

missing = [var for var in REQUIRED_VARS if not os.environ.get(var)]
if missing:
    print("ERROR: Missing required environment variables:")
    for var in missing:
        print(f"  - {var}")
    print("\nCopy .env.example to .env and fill in your values:")
    print("  cp .env.example .env")
    sys.exit(1)
```

---

## Our Multi-Repo Architecture

### Current Structure

```
~/PycharmProjects/
├── brc-tools/           # Shared utilities (data download, upload)
│   ├── pyproject.toml   # Makes it installable
│   ├── .env.example     # Template for local dev
│   ├── .env             # Your secrets (gitignored)
│   └── brc_tools/       # Actual code
│       └── download/
│           └── push_data.py
│
└── clyfar/              # Ozone prediction model
    ├── requirements.txt
    ├── .env.example
    ├── .env
    └── run_gefs_clyfar.py

~/WebStormProjects/
└── ubair-website/       # Node.js website (separate from Python)
    ├── .env.example
    └── server/
        └── routes/
            └── dataUpload.js
```

### Dependency Flow

```
clyfar → (imports) → brc-tools
  ↓ (uploads to)
ubair-website (receives via HTTP API)
```

**Key insight:** clyfar doesn't import ubair-website code. They communicate via HTTP API.

### How to Share Code Between Python Repos

**Option A: Package Install (RECOMMENDED)**
```bash
conda activate clyfar
pip install -e ~/PycharmProjects/brc-tools
```

Now in clyfar:
```python
from brc_tools.download.push_data import send_json_to_server
```

**Option B: Copy Shared Code**
- Copy `push_data.py` to clyfar
- Simple but duplicates code
- Use if brc-tools is unstable

**Option C: Call as Subprocess**
```python
import subprocess
subprocess.run([
    '~/PycharmProjects/brc-tools/venv/bin/python',
    '~/PycharmProjects/brc-tools/brc_tools/download/push_data.py',
    'forecasts',
    'data.json'
])
```

---

## Step-by-Step Setup

### For Local Development

**1. Verify brc-tools is packaged:**
```bash
cd ~/PycharmProjects/brc-tools
ls pyproject.toml  # Should exist
cat pyproject.toml | grep name  # Should show "brc-tools"
```

**2. Install brc-tools in its own environment:**
```bash
conda activate brc-tools  # Or create if doesn't exist
pip install -e .  # Install in editable mode

# Test it works
python -c "from brc_tools.download.push_data import send_json_to_server; print('Success!')"
```

**3. Install brc-tools in clyfar environment:**
```bash
conda activate clyfar
pip install -e ~/PycharmProjects/brc-tools  # Note: full path

# Test it works from clyfar
python -c "from brc_tools.download.push_data import send_json_to_server; print('Success!')"
```

**4. Set up .env files:**
```bash
# In brc-tools
cd ~/PycharmProjects/brc-tools
cp .env.example .env
vim .env  # Fill in your API keys

# In clyfar
cd ~/PycharmProjects/clyfar
cp .env.example .env  # If exists
vim .env  # Fill in API keys (can be same as brc-tools)
```

**5. Test import from clyfar:**
```bash
cd ~/PycharmProjects/clyfar
conda activate clyfar
python -c "
from brc_tools.download.push_data import send_json_to_server
print('Import successful!')
print('Function:', send_json_to_server)
"
```

### For CHPC Deployment

**1. Clone repos to CHPC:**
```bash
ssh username@chpc.utah.edu
cd ~
git clone https://github.com/Bingham-Research-Center/brc-tools.git
git clone https://github.com/Bingham-Research-Center/clyfar.git
```

**2. Create conda environments:**
```bash
# brc-tools environment
conda create -n brc-tools python=3.11
conda activate brc-tools
cd ~/brc-tools
pip install -r requirements.txt
pip install -e .

# clyfar environment
conda create -n clyfar python=3.11
conda activate clyfar
cd ~/clyfar
pip install -r requirements.txt
pip install -e ~/brc-tools  # Install brc-tools for imports
```

**3. Set up environment variables (no .env on server):**
```bash
# Create secrets file
cat > ~/.bashrc_basinwx <<'EOF'
# BasinWx Secrets
export DATA_UPLOAD_API_KEY="your-production-key-here"
export SYNOPTIC_API_TOKEN="your-synoptic-token"
export BASINWX_API_URL="https://basinwx.com"
EOF

chmod 600 ~/.bashrc_basinwx  # Protect secrets

# Add to .bashrc
echo "source ~/.bashrc_basinwx" >> ~/.bashrc
source ~/.bashrc

# Verify
echo $DATA_UPLOAD_API_KEY  # Should print your key
```

**4. Test on CHPC:**
```bash
# Test brc-tools
conda activate brc-tools
cd ~/brc-tools
python brc_tools/download/get_map_obs.py  # Should download and upload

# Test clyfar
conda activate clyfar
cd ~/clyfar
python -c "from brc_tools.download.push_data import send_json_to_server; print('OK')"
```

**5. Set up cron (use observations-only template first):**
```bash
crontab -e
# Paste from ubair-website/chpc-deployment/cron_templates/crontab_observations_only.txt
```

---

## Testing the Setup

### Test 1: Can Python Find the Package?

**From brc-tools environment:**
```bash
conda activate brc-tools
python -c "import brc_tools; print(brc_tools.__file__)"
# Should print: /path/to/PycharmProjects/brc-tools/brc_tools/__init__.py
```

**From clyfar environment:**
```bash
conda activate clyfar
python -c "import brc_tools; print(brc_tools.__file__)"
# Should print same path (points to source, not copied)
```

### Test 2: Can You Import Specific Functions?

```bash
conda activate clyfar
python -c "
from brc_tools.download.push_data import send_json_to_server
import inspect
print('Function signature:')
print(inspect.signature(send_json_to_server))
"
```

### Test 3: Do Changes Propagate? (Editable Install Test)

**Make a change:**
```bash
# Edit brc-tools
cd ~/PycharmProjects/brc-tools
echo "TEST_CONSTANT = 'hello from brc-tools'" >> brc_tools/__init__.py
```

**Check from clyfar (without reinstalling):**
```bash
conda activate clyfar
python -c "
import brc_tools
print(brc_tools.TEST_CONSTANT)  # Should print: hello from brc-tools
"
```

If this works, editable install is working correctly!

**Clean up:**
```bash
cd ~/PycharmProjects/brc-tools
# Remove TEST_CONSTANT line from brc_tools/__init__.py
```

### Test 4: Environment Variables Load

**Create test script:**
```python
# test_env.py
from dotenv import load_dotenv
import os

load_dotenv()

print("Checking environment variables...")

required = ['DATA_UPLOAD_API_KEY', 'SYNOPTIC_API_TOKEN']
for var in required:
    value = os.environ.get(var)
    if value:
        print(f"✓ {var}: {value[:10]}... (hidden)")
    else:
        print(f"✗ {var}: NOT SET")
```

**Run it:**
```bash
conda activate clyfar
python test_env.py
```

### Test 5: Full Pipeline Test

**Upload test data to website:**
```bash
conda activate brc-tools
cd ~/PycharmProjects/brc-tools

# Run the observation script
python brc_tools/download/get_map_obs.py

# Check logs for "successfully" message
```

---

## Deployment Checklist

### Before Deploying to CHPC

- [ ] brc-tools has `pyproject.toml`
- [ ] brc-tools installs locally: `pip install -e ~/PycharmProjects/brc-tools`
- [ ] Can import from clyfar: `from brc_tools.download.push_data import ...`
- [ ] `.env.example` exists in both repos
- [ ] `.env` is in `.gitignore`
- [ ] Secrets documented in `.env.example`
- [ ] Code doesn't have hardcoded paths (`../../brc-tools`, etc.)
- [ ] Website API endpoint works: `curl https://basinwx.com/api/health`

### On CHPC

- [ ] Both repos cloned to `~/brc-tools` and `~/clyfar`
- [ ] Conda environments created
- [ ] brc-tools installed editable in both environments
- [ ] Environment variables set in `~/.bashrc_basinwx`
- [ ] Variables sourced: `source ~/.bashrc`
- [ ] Test import works from both environments
- [ ] Cron template copied and edited
- [ ] Cron installed: `crontab -e`
- [ ] Logs directory created: `mkdir -p ~/logs/basinwx`
- [ ] Test run successful (check logs)
- [ ] Monitor for 24 hours

### For New Team Member

- [ ] Clone repos
- [ ] Get API keys from team lead
- [ ] Copy `.env.example` to `.env` in each repo
- [ ] Fill in API keys in `.env`
- [ ] Create conda environments
- [ ] Install brc-tools: `pip install -e path/to/brc-tools`
- [ ] Install other dependencies
- [ ] Run tests
- [ ] Can upload test data

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'brc_tools'"

**Cause:** Package not installed in current environment.

**Solution:**
```bash
conda activate clyfar  # Make sure you're in right env
pip install -e ~/PycharmProjects/brc-tools
```

**Check:**
```bash
pip list | grep brc-tools
# Should show: brc-tools 0.1.0 /path/to/brc-tools
```

### "ImportError: cannot import name 'send_json_to_server'"

**Cause:** Function doesn't exist or name typo.

**Solution:**
```bash
# Check what's in the module
python -c "
from brc_tools.download import push_data
print(dir(push_data))
"
```

### Changes to brc-tools Not Reflected

**Cause:** Not installed in editable mode, or need to restart Python.

**Solution:**
```bash
# Reinstall in editable mode
pip uninstall brc-tools
pip install -e ~/PycharmProjects/brc-tools

# If using Jupyter, restart kernel
```

### .env Variables Not Loading

**Cause:** `load_dotenv()` not called or called in wrong place.

**Solution:**
```python
# At TOP of your script (e.g., run_gefs_clyfar.py)
from dotenv import load_dotenv
load_dotenv()  # Call this BEFORE accessing os.environ

import os
api_key = os.environ.get('DATA_UPLOAD_API_KEY')
```

**Alternative (server deployment):**
```bash
# Use shell RC instead
export DATA_UPLOAD_API_KEY="..."  # In ~/.bashrc_basinwx
```

### "pip install -e" Says "No pyproject.toml"

**Cause:** Running from wrong directory.

**Solution:**
```bash
cd /path/to/brc-tools  # Must be in root of package
ls pyproject.toml      # Verify file exists
pip install -e .       # Then install
```

### Conda vs pip Conflicts

**Symptom:** Packages installed but imports fail.

**Cause:** Mixed conda/pip installations creating conflicts.

**Solution:**
```bash
# Check what installed what
conda list | grep brc-tools  # Should show <pip>
conda list | grep numpy      # Might show conda channel

# Prefer conda for big scientific packages:
conda install numpy pandas matplotlib

# Use pip for pure Python or local packages:
pip install requests python-dotenv
pip install -e ~/brc-tools
```

---

## Summary: Quick Reference

**Install brc-tools for development:**
```bash
conda activate your-env
pip install -e ~/PycharmProjects/brc-tools
```

**Use in code:**
```python
from brc_tools.download.push_data import send_json_to_server
```

**Set up .env:**
```bash
cp .env.example .env
vim .env  # Add secrets
```

**Load .env in code:**
```python
from dotenv import load_dotenv
load_dotenv()
```

**Test it works:**
```bash
python -c "from brc_tools.download.push_data import send_json_to_server; print('OK')"
```

**Deploy to CHPC:**
1. Clone repos
2. Create conda envs
3. Install packages (`pip install -e`)
4. Set environment variables (RC file, not .env)
5. Set up cron
6. Monitor logs

---

## Next Steps

1. **Verify current state:** Check if `pip list | grep brc-tools` shows it's installed
2. **Test imports:** Try importing from clyfar environment
3. **Create .env files:** Set up secrets for local development
4. **Implement Clyfar upload:** Now we can safely use `from brc_tools.download...`
5. **Test locally:** Full end-to-end test before CHPC
6. **Deploy to CHPC:** Follow deployment checklist
7. **Monitor:** Check logs for 24-48 hours

**Questions to answer:**
- Is brc-tools already installed in clyfar env? (`pip list | grep brc-tools`)
- Do you have `.env` files set up with API keys?
- Ready to implement Clyfar upload using proper imports?
