#!/bin/bash

configs=("eww" 
	     "end-rs" 
		 "niri" 
		 "systemd"
		 "kitty"
		 "waybar"
		 "nvim"
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
