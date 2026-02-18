# Deployment Specs - Verification Needed

**IMPORTANT**: Verify these specs before deploying to production

## CHPC (notchpeak-shared-short)

**System Info** (verified 2025-11-23):
- OS: Rocky Linux 8.10 (RHEL 8 clone)
- Support until: 2029-05-31
- Python: Use conda (system Python is 3.6)
- Package manager: dnf (not apt)

**Need to verify:**
- [ ] CPU/memory limits per job
- [ ] Max walltime for shared-short partition
- [ ] Concurrent job limits
- [ ] Storage quotas (home directory, scratch space)
- [ ] Network egress limits (for API uploads)
- [ ] Herbie download performance (parallel vs sequential)
- [ ] Optimal ncpus for Clyfar (currently set to 16 - is this efficient?)
- [ ] Whether login node usage is actually a problem for our workload
- [ ] GLIBC version compatibility (Rocky 8 uses 2.28)

**Commands to check:**
```bash
# Check partition limits
scontrol show partition notchpeak-shared-short

# Check your quota
quota -s

# Check past job efficiency
sacct -u $USER --format=JobID,JobName,Elapsed,CPUTime,MaxRSS,State
```

## Akamai/Linode (basinwx.com)
**Need to verify:**
- [ ] Server RAM/CPU specs
- [ ] Disk space limits
- [ ] Node.js version
- [ ] Inbound request rate limits
- [ ] File upload size limits (currently set to 10MB)
- [ ] Concurrent connection limits
- [ ] Log retention policy (analytics logs could grow large)
- [ ] Whether 63 JSON files × 4 times daily is a problem

**Where to check:**
- Akamai/Linode control panel
- Contact hosting team
- `free -h` and `df -h` on server

## API Upload Performance
**Need to measure:**
- [ ] Upload time for 63 JSON files (total ~50-100MB?)
- [ ] Whether sequential or parallel uploads are better
- [ ] Network bandwidth between CHPC and Akamai
- [ ] Whether batching files helps (one big tarball vs 63 POSTs)

## Optimization Opportunities
**After measuring above:**
- [ ] Adjust Slurm --cpus-per-task based on actual scaling
- [ ] Consider using CHPC scratch space instead of home directory
- [ ] Implement parallel uploads if sequential is slow
- [ ] Add retry logic for failed uploads
- [ ] Consider compressing JSON files (gzip) before upload
- [ ] Add monitoring/alerting for job failures

## Next Steps
1. Deploy to CHPC staging/test environment first
2. Run ONE forecast cycle and measure everything
3. Optimize based on actual measurements, not assumptions
4. Document findings in this file
5. Update Slurm script and export code accordingly

---
**Created:** 2025-11-23
**Status:** Pre-deployment verification phase
