#!/bin/bash
# JOOS v1.1 - Enable Debug Mode (Mac)
# This allows unsigned CEP extensions to run in After Effects

echo ""
echo "========================================"
echo "  JOOS v1.1 - Debug Mode Enabler (Mac)"
echo "========================================"
echo ""
echo "This will enable debug mode for Adobe CEP extensions."
echo "After running this, restart After Effects."
echo ""
read -p "Press Enter to continue..."

# Set plist values for CEP debug mode
echo "Adding debug mode settings..."
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1

echo ""
echo "========================================"
echo "  Success!"
echo "========================================"
echo ""
echo "Debug mode enabled for CEP extensions."
echo "Please restart After Effects."
echo ""
read -p "Press Enter to exit..."
