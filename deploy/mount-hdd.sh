#!/bin/sh
set -eu

die() {
  echo "mount-hdd: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run as root"
: "${HDD_DEVICE:?set HDD_DEVICE to the slow-disk block device, for example /dev/vdb1}"
HDD_MOUNT_POINT=${HDD_MOUNT_POINT:-/data}

[ -b "$HDD_DEVICE" ] || die "$HDD_DEVICE is not a block device"

root_source=$(findmnt -no SOURCE / 2>/dev/null || true)
[ "$HDD_DEVICE" != "$root_source" ] || die "refusing to format or mount the root device"

mkdir -p "$HDD_MOUNT_POINT"
if mountpoint -q "$HDD_MOUNT_POINT"; then
  mounted_source=$(findmnt -no SOURCE "$HDD_MOUNT_POINT" 2>/dev/null || true)
  [ "$mounted_source" = "$HDD_DEVICE" ] || die "$HDD_MOUNT_POINT is already mounted from $mounted_source"
  echo "$HDD_MOUNT_POINT is already mounted from $HDD_DEVICE"
  exit 0
fi

if blkid "$HDD_DEVICE" >/dev/null 2>&1; then
  [ "${ALLOW_EXISTING_FILESYSTEM:-no}" = "yes" ] || die "$HDD_DEVICE already has a filesystem; set ALLOW_EXISTING_FILESYSTEM=yes after verifying it is the correct disk"
else
  [ "${FORMAT_HDD:-NO}" = "YES" ] || die "no filesystem found; set FORMAT_HDD=YES only after confirming the disk is disposable"
  mkfs.ext4 -L business-central-hdd "$HDD_DEVICE"
fi

mount "$HDD_DEVICE" "$HDD_MOUNT_POINT"
uuid=$(blkid -s UUID -o value "$HDD_DEVICE")
[ -n "$uuid" ] || die "could not read the filesystem UUID"

fstab_line="UUID=$uuid $HDD_MOUNT_POINT ext4 defaults,noatime 0 2"
if ! grep -Fq " $HDD_MOUNT_POINT " /etc/fstab; then
  printf '%s\n' "$fstab_line" >> /etc/fstab
fi

chmod 0750 "$HDD_MOUNT_POINT"
echo "mounted $HDD_DEVICE at $HDD_MOUNT_POINT and persisted it in /etc/fstab"
