#!/bin/bash
# Script to copy SEO assets to public folder

echo "Copying favicon and SEO image to public folder..."

# Copy favicon
cp frontend/Image/faviconkeycube.svg frontend/public/favicon.svg
echo "✅ Favicon copied to public/favicon.svg"

# Copy SEO image
cp frontend/Image/SEOimage.png frontend/public/og-image.png
echo "✅ SEO image copied to public/og-image.png"

echo "Done! SEO assets are now in the public folder."
