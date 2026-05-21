module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["js", "mjs"],
  transform: {
    "^.+\\.m?js$": "babel-jest",
  },
  verbose: true,
};
