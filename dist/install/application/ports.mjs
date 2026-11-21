// What the two commands need from outside the feature's rules: the disk, the
// past releases and a file diff. Declared here and implemented in `infra/`;
// the CLI picks the implementations and hands them in. The use cases import
// nothing from `infra/` - until the review of 2.0 they took git by parameter
// and reached for the disk directly, two ways of wiring in one function.
export {};
