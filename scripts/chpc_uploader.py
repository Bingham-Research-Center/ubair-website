#!/usr/bin/env python3
"""
BasinWx Data Uploader for CHPC
================================
Manifest-driven data upload script that enforces schema validation
and provides robust error handling, logging, and monitoring.

Usage:
    python chpc_uploader.py --data-type observations --file data.json
    python chpc_uploader.py --validate-only --file data.json

Environment Variables:
    BASINWX_API_KEY    : API key for authentication
    BASINWX_API_URL    : Base URL (default: https://basinwx.com)
    CHPC_HOSTNAME      : Hostname to send in headers
"""

import os
import sys
import json
import logging
import argparse
import socket
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import requests
from jsonschema import validate, ValidationError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/basinwx_upload.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('basinwx_uploader')


class DataManifest:
    """Loads and provides access to the data manifest"""

    def __init__(self, manifest_path: str = 'DATA_MANIFEST.json'):
        self.manifest_path = manifest_path
        self.manifest = self._load_manifest()

    def _load_manifest(self) -> Dict[str, Any]:
        """Load the manifest file"""
        try:
            with open(self.manifest_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"Manifest file not found: {self.manifest_path}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in manifest: {e}")
            raise

    def get_data_type_spec(self, data_type: str) -> Optional[Dict[str, Any]]:
        """Get specification for a data type"""
        return self.manifest.get('dataTypes', {}).get(data_type)

    def get_all_data_types(self) -> List[str]:
        """Get list of all valid data types"""
        return list(self.manifest.get('dataTypes', {}).keys())

    def get_validation_rules(self, data_type: str) -> Dict[str, Any]:
        """Get validation rules for a data type"""
        spec = self.get_data_type_spec(data_type)
        return spec.get('validation', {}) if spec else {}


class DataValidator:
    """Validates data against manifest schema"""

    def __init__(self, manifest: DataManifest):
        self.manifest = manifest

    def validate_file_size(self, file_path: str, data_type: str) -> bool:
        """Check if file size is within limits"""
        size_bytes = os.path.getsize(file_path)
        spec = self.manifest.get_data_type_spec(data_type)

        if not spec:
            logger.error(f"Unknown data type: {data_type}")
            return False

        max_size_str = spec.get('validation', {}).get('maxFileSize', '10MB')
        max_size_bytes = self._parse_size(max_size_str)

        if size_bytes > max_size_bytes:
            logger.error(f"File too large: {size_bytes} bytes > {max_size_bytes} bytes")
            return False

        logger.info(f"File size OK: {size_bytes} bytes")
        return True

    def _parse_size(self, size_str: str) -> int:
        """Convert size string like '10MB' to bytes"""
        units = {'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3}
        size_str = size_str.upper().strip()

        for unit, multiplier in sorted(units.items(), key=lambda x: -len(x[0])):
            if size_str.endswith(unit):
                number_str = size_str[:-len(unit)].strip()
                number = float(number_str)
                return int(number * multiplier)

        return int(size_str)

    def validate_json_structure(self, data: Any, data_type: str) -> bool:
        """Validate JSON data against schema"""
        spec = self.manifest.get_data_type_spec(data_type)

        if not spec:
            logger.error(f"Unknown data type: {data_type}")
            return False

        schema = spec.get('schema')
        if not schema:
            logger.warning(f"No schema defined for {data_type}, skipping structure validation")
            return True

        try:
            validate(instance=data, schema=schema)
            logger.info("JSON structure validation passed")
            return True
        except ValidationError as e:
            logger.error(f"JSON structure validation failed: {e.message}")
            logger.error(f"Failed at path: {list(e.path)}")
            return False

    def validate_observations(self, data: List[Dict]) -> bool:
        """Special validation for observations data"""
        if not isinstance(data, list):
            logger.error("Observations must be an array")
            return False

        spec = self.manifest.get_data_type_spec('observations')
        validation = spec.get('validation', {})

        # Check record count
        max_records = validation.get('maxRecords', 50000)
        if len(data) > max_records:
            logger.error(f"Too many records: {len(data)} > {max_records}")
            return False

        # Check required variables per station
        required_vars = set(validation.get('requiredVariables', []))
        unit_mapping = validation.get('unitMapping', {})

        stations = {}
        for obs in data:
            stid = obs.get('stid')
            variable = obs.get('variable')
            units = obs.get('units')

            if not stid or not variable:
                continue

            # Track variables per station
            if stid not in stations:
                stations[stid] = set()
            stations[stid].add(variable)

            # Validate units
            expected_unit = unit_mapping.get(variable)
            if expected_unit and units != expected_unit:
                logger.warning(f"Unit mismatch for {variable}: expected {expected_unit}, got {units}")

        # Check each station has required variables
        missing_vars = []
        for stid, variables in stations.items():
            missing = required_vars - variables
            if missing:
                missing_vars.append(f"{stid}: {missing}")

        if missing_vars:
            logger.warning(f"Stations missing required variables:\n" + "\n".join(missing_vars[:5]))
            # This is a warning, not a hard failure

        logger.info(f"Validated {len(data)} observations for {len(stations)} stations")
        return True


class BasinWxUploader:
    """Handles uploading data to BasinWx API"""

    def __init__(self, api_key: str, api_url: str = "https://basinwx.com"):
        self.api_key = api_key
        self.api_url = api_url.rstrip('/')
        self.session = requests.Session()
        self.hostname = socket.gethostname()

    def upload_file(self, file_path: str, data_type: str, retries: int = 3) -> bool:
        """Upload a file to the API with retry logic"""
        spec = manifest.get_data_type_spec(data_type)

        if not spec:
            logger.error(f"Unknown data type: {data_type}")
            return False

        endpoint = spec.get('endpoint')
        url = f"{self.api_url}{endpoint}"

        headers = {
            'x-api-key': self.api_key,
            'x-client-hostname': self.hostname
        }

        for attempt in range(1, retries + 1):
            try:
                logger.info(f"Upload attempt {attempt}/{retries} to {url}")

                with open(file_path, 'rb') as f:
                    files = {'file': (os.path.basename(file_path), f)}
                    response = self.session.post(
                        url,
                        headers=headers,
                        files=files,
                        timeout=30
                    )

                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"✓ Upload successful: {result}")
                    return True
                else:
                    logger.error(f"✗ Upload failed: {response.status_code} - {response.text}")

                    if response.status_code in [401, 403]:
                        # Don't retry auth failures
                        return False

            except requests.exceptions.RequestException as e:
                logger.error(f"✗ Upload exception: {e}")

            if attempt < retries:
                import time
                wait_time = 5 * (2 ** (attempt - 1))  # Exponential backoff
                logger.info(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)

        logger.error(f"✗ Upload failed after {retries} attempts")
        return False

    def health_check(self) -> bool:
        """Check if API is available"""
        try:
            response = self.session.get(f"{self.api_url}/api/health", timeout=10)
            if response.status_code == 200:
                logger.info("✓ API health check passed")
                return True
            else:
                logger.warning(f"API health check returned {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"API health check failed: {e}")
            return False


def generate_filename(data_type: str, timestamp: Optional[datetime] = None) -> str:
    """Generate filename according to manifest pattern"""
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    spec = manifest.get_data_type_spec(data_type)
    if not spec:
        raise ValueError(f"Unknown data type: {data_type}")

    pattern = spec.get('filename', {}).get('pattern', '')

    # Replace placeholders
    filename = pattern.replace('YYYY', timestamp.strftime('%Y'))
    filename = filename.replace('MM', timestamp.strftime('%m'))
    filename = filename.replace('DD', timestamp.strftime('%d'))
    filename = filename.replace('HH', timestamp.strftime('%H'))
    filename = filename.replace('mm', timestamp.strftime('%M'))
    filename = filename.replace('Z', 'Z')

    return filename


def main():
    parser = argparse.ArgumentParser(
        description='Upload weather data to BasinWx with manifest validation'
    )
    parser.add_argument('--data-type',
                        choices=['observations', 'metadata', 'timeseries', 'outlooks', 'images'],
                        help='Type of data to upload')
    parser.add_argument('--file', type=str, help='Path to file to upload')
    parser.add_argument('--validate-only', action='store_true',
                        help='Only validate, do not upload')
    parser.add_argument('--manifest', type=str, default='DATA_MANIFEST.json',
                        help='Path to manifest file')
    parser.add_argument('--health-check', action='store_true',
                        help='Only check API health')

    args = parser.parse_args()

    # Load manifest
    global manifest
    manifest = DataManifest(args.manifest)
    logger.info(f"Loaded manifest version {manifest.manifest.get('version')}")

    # Health check only
    if args.health_check:
        api_key = os.environ.get('BASINWX_API_KEY')
        api_url = os.environ.get('BASINWX_API_URL', 'https://basinwx.com')

        if not api_key:
            logger.error("BASINWX_API_KEY environment variable not set")
            sys.exit(1)

        uploader = BasinWxUploader(api_key, api_url)
        success = uploader.health_check()
        sys.exit(0 if success else 1)

    # Validate arguments
    if not args.file or not args.data_type:
        parser.error("--file and --data-type are required")

    if not os.path.exists(args.file):
        logger.error(f"File not found: {args.file}")
        sys.exit(1)

    # Initialize validator
    validator = DataValidator(manifest)

    # Validate file size
    if not validator.validate_file_size(args.file, args.data_type):
        sys.exit(1)

    # Load and validate JSON (if applicable)
    if args.data_type in ['observations', 'metadata', 'timeseries']:
        try:
            with open(args.file, 'r') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            sys.exit(1)

        # Validate structure
        if not validator.validate_json_structure(data, args.data_type):
            sys.exit(1)

        # Special validation for observations
        if args.data_type == 'observations':
            if not validator.validate_observations(data):
                sys.exit(1)

    logger.info("✓ All validation checks passed")

    # If validate-only, exit here
    if args.validate_only:
        logger.info("Validation complete (no upload performed)")
        sys.exit(0)

    # Upload
    api_key = os.environ.get('BASINWX_API_KEY')
    api_url = os.environ.get('BASINWX_API_URL', 'https://basinwx.com')

    if not api_key:
        logger.error("BASINWX_API_KEY environment variable not set")
        sys.exit(1)

    uploader = BasinWxUploader(api_key, api_url)

    # Health check first
    if not uploader.health_check():
        logger.warning("API health check failed, but proceeding with upload...")

    # Upload file
    success = uploader.upload_file(args.file, args.data_type)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
