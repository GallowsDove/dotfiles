#!/bin/bash

configs=("eww" 
	     "end-rs" 
		 "niri" 
		 "systemd"
		 "kitty"
		 "waybar"
		 "nvim"
		 "fuzzel"
		 "gtk-2.0"
		 "gtk-3.0"
		 "gtk-4.0"
	    )

for config in "${configs[@]}"; do
  if [ -d "$config" ] && [ -d ~/.config/$config ]; then
	echo "Refreshing: $config"
	rm -r "./$config"
    cp -r ~/.config/$config .
  elif [ -d ~/.config/$config ]; then
	echo "Copying: $config"
    cp -r ~/.config/$config .
  else
	echo "Not Found: $config" 1>&2
  fi
done
