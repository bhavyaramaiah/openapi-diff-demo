# openapi-diff-demoopenapi-diff package for checking the difference in api schemas

command
npm openapi-diff <previous.yaml> <current.yaml>

works for yaml format below
npx openapi-diff source.yaml dest.yaml

not working for below formats
npx openapi-diff current_oa3.yaml new_oa3.yaml

node script to detect changes
node compare-yaml-schemas.js current.yml new.yml