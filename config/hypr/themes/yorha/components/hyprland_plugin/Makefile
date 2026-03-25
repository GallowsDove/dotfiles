CXX ?= c++
CXXFLAGS ?= -O2 -g -std=c++23 -fPIC -Wall -Wextra
PKG_CONFIG ?= pkg-config

HYPR_CFLAGS := $(shell $(PKG_CONFIG) --cflags hyprland)
HYPR_LIBS := $(shell $(PKG_CONFIG) --libs hyprland)

TARGET := libyorha-window-fx.so
SOURCES := yorha_window_fx.cpp

all: $(TARGET)

$(TARGET): $(SOURCES)
	$(CXX) $(CXXFLAGS) $(HYPR_CFLAGS) -shared -o $@ $(SOURCES) $(HYPR_LIBS)

clean:
	rm -f $(TARGET)

.PHONY: all clean
