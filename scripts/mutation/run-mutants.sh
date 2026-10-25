#!/usr/bin/env bash
# Mutation check of the security and scope guards: each mutant disables one guard, the module is
# rebuilt and deployed, and the Cypress spec that covers the guard must FAIL. A mutant whose spec
# passes is a guard no test reaches. The original source is restored after each mutant.
#
# Usage (from the module root, with a local Jahia running the module):
#   JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=root1234 scripts/mutation/run-mutants.sh
# Extra Cypress env (CYPRESS_SNR_TEMPLATE_SET...) is passed through.
#
# Equivalent mutant, not listed: dropping the system-namespace check in TextFields#isEditableName
# survives this suite because j:tagList, the system property it seeds, is refused by its tag
# selector too; the name check is defence in depth for system properties edited as small text.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JAVA="$ROOT/src/main/java/org/jahia/modules/searchandreplace"
: "${JAHIA_URL:?set JAHIA_URL}" "${SUPER_USER_PASSWORD:?set SUPER_USER_PASSWORD}"

deploy() {
  (cd "$ROOT" && mvn -q clean install -o -DskipTests >/dev/null)
  local jar
  jar=$(ls "$ROOT"/target/search-and-replace-*.jar | grep -v sources | head -1)
  curl -sf -u "root:$SUPER_USER_PASSWORD" \
    -F "script=[{\"installAndStartBundle\":\"$(basename "$jar")\",\"forceUpdate\":true}];type=application/json" \
    -F "file=@$jar" "$JAHIA_URL/modules/api/provisioning" >/dev/null
  sleep 5
}

survivors=0

# run_mutant <name> <file> <spec that must fail> <perl substitution>
run_mutant() {
  local name="$1" file="$2" spec="$3" subst="$4"
  cp "$file" "$file.orig"
  trap 'mv "$file.orig" "$file"' EXIT
  perl -pi -e "$subst" "$file"
  if cmp -s "$file" "$file.orig"; then
    echo "NOT FOUND  $name: the pattern no longer matches $file - update this script"
    survivors=$((survivors + 1))
  else
    deploy
    if (cd "$ROOT/tests" && npx cypress run --browser electron --spec "cypress/e2e/$spec" >/dev/null 2>&1); then
      echo "SURVIVED   $name ($spec passed)"; survivors=$((survivors + 1))
    else
      echo "KILLED     $name ($spec failed)"
    fi
  fi
  mv "$file.orig" "$file"
  trap - EXIT
}

run_mutant permission-check-dropped "$JAVA/graphql/SiteAccess.java" authorization.spec.ts \
  's/ \|\| !site\.hasPermission\(PERMISSION\)//'
run_mutant site-bound-dropped "$JAVA/graphql/SearchAndReplaceMutations.java" authorization.spec.ts \
  's/if \(!node\.getPath\(\)\.startsWith\("\/sites\/" \+ siteKey \+ "\/"\)\)/if (false)/'
run_mutant pages-in-scope "$JAVA/service/ReplaceScope.java" replace-scope.spec.ts \
  's/"jnt:page", //'
run_mutant rich-text-as-plain "$JAVA/service/TextFields.java" replace-scope.spec.ts \
  's/return Kind\.HTML;/return Kind.PLAIN;/'

echo "Restoring the original module"
deploy
echo "$survivors mutant(s) survived or not found"
exit "$survivors"
