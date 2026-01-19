#!/bin/bash

# COMPLETE Backup script for Reward Project
# This script creates a COMPLETE backup including ALL files
# Target: TEK-BACKUP

SOURCE_DIR="/home/van/reward-project"
BACKUP_DIR="/home/van/TEK-BACKUP"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo "============================================================"
echo "Creating COMPLETE backup of Reward Project"
echo "INCLUDING ALL FILES (node_modules, .git, everything)"
echo "============================================================"
echo "Source: $SOURCE_DIR"
echo "Backup: $BACKUP_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory does not exist: $SOURCE_DIR"
    exit 1
fi

# Check if backup directory already exists
if [ -d "$BACKUP_DIR" ]; then
    echo "WARNING: Backup directory already exists: $BACKUP_DIR"
    echo "Removing existing backup..."
    rm -rf "$BACKUP_DIR"
fi

# Copy the ENTIRE project including everything
echo "Copying ALL files and directories..."
echo "This may take several minutes due to node_modules size..."
echo ""

# Use cp with all files (preserving attributes)
cp -rp "$SOURCE_DIR" "$BACKUP_DIR"

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================================"
    echo "COMPLETE Backup finished successfully!"
    echo "============================================================"
    echo "Backup location: $BACKUP_DIR"
    echo ""
    
    # Count files
    FILE_COUNT=$(find "$BACKUP_DIR" -type f | wc -l)
    DIR_COUNT=$(find "$BACKUP_DIR" -type d | wc -l)
    SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    
    echo "Total files copied: $FILE_COUNT"
    echo "Total directories: $DIR_COUNT"
    echo "Total size: $SIZE"
    echo ""
    echo "Backup includes:"
    echo "  ✓ ALL source code files"
    echo "  ✓ ALL configuration files"
    echo "  ✓ ALL documentation"
    echo "  ✓ node_modules (all dependencies)"
    echo "  ✓ .git directory (full version history)"
    echo "  ✓ All other files and directories"
    echo ""
    echo "This is a COMPLETE backup ready for external hard drive storage."
    echo ""
else
    echo ""
    echo "ERROR: Backup failed!"
    exit 1
fi
