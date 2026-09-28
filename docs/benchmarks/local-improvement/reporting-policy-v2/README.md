# Critical failure accounting v2

A wrong O.M.A. closure is a wrong-window failure. Older raw rows used an
ordinary error for this exact harness event; v2 counts it as critical without
changing the raw observation or success status. This strict policy applies to
both baseline and candidate, not only to one model. All other explicit critical
flags remain critical. The accompanying command and metrics files reproduce
this classification.
