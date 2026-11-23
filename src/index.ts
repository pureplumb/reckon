export function greet(name: string) {
  return `Hello, ${name}!`;
}

if (import.meta.main) {
  console.log(greet("Bun"));
}
