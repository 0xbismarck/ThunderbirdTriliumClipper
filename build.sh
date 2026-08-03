#!/bin/sh
#
# Build the TriliumClipper add-on into an installable XPI file.
#
# Note that the XPI is deleted before it is built. Without this, zip adds to
# whatever archive is already there, so files removed from the source tree
# would stay in the package and be flagged during add-on review.

set -e

XPI="triliumclipper.xpi"

# Start from a clean archive so removed files do not linger in the package.
rm -f "$XPI"

cd source

# -r  recurse into the source folders
# -X  leave out the extra file attributes that record the building machine
# -x  leave out editor and operating system clutter
zip -r -X "../$XPI" * \
    -x "*.DS_Store" "*Thumbs.db" "*~" "*.orig" "*.rej" "*.swp"

cd ..

echo "Built $XPI"
