#
# Copyright (c) 2012, Joyent, Inc. All rights reserved.
#
# Makefile: basic Makefile for template API service
#
# This Makefile is a template for new repos. It contains only repo-specific
# logic and uses included makefiles to supply common targets (javascriptlint,
# jsstyle, restdown, etc.), which are used by other repos as well. You may well
# need to rewrite most of this file, but you shouldn't need to touch the
# included makefiles.
#
# If you find yourself adding support for new targets that could be useful for
# other projects too, you should add these to the original versions of the
# included Makefiles (in eng.git) so that other teams can use them too.
#

#
# Tools
#
BUNYAN		:= ./node_modules/.bin/bunyan
NPM		:= npm
NODECOVER	:= ./node_modules/.bin/cover
NODEUNIT	:= ./node_modules/.bin/nodeunit

#
# Files
#
DOC_FILES	 = index.restdown
JS_FILES	:= $(shell ls *.js) $(shell find lib test -name '*.js')
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE   = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS    = -f tools/jsstyle.conf

include ./tools/mk/Makefile.defs

#
# Repo-specific targets
#
.PHONY: all
all: $(NODEUNIT) $(REPO_DEPS)
	$(NPM) rebuild

$(NODEUNIT):
	$(NPM) install

CLEAN_FILES += ./node_modules

.PHONY: cover
cover: $(NODECOVER)
	@rm -fr ./.coverage_data
	$(NODECOVER) run $(NODEUNIT) test/*.test.js | $(BUNYAN)
	$(NODECOVER) report cli

.PHONY: test
test: $(NODEUNIT)
	$(NODEUNIT) ./test/client.test.js 2>&1 | $(BUNYAN)
	$(NODEUNIT) ./test/election.test.js 2>&1 | $(BUNYAN)
	$(NODEUNIT) ./test/general-election.test.js 2>&1 | $(BUNYAN)

include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
