EMACS = emacs
CASK = EMACS=${EMACS} cask
DEPENDENCIES = .cask/

all: uncompile compile

compile: ${DEPENDENCIES}
	${CASK} exec ${EMACS} -Q -batch \
	-L . \
        -f batch-byte-compile tern-context-coloring.el

uncompile:
	rm -f *.elc

clean: uncompile
	rm -rf ${DEPENDENCIES}

${DEPENDENCIES}:
	${CASK}

.PHONY: all compile uncompile clean
