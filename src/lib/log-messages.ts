export const logMessages = {
  docker: {
    apiVersionFallback: 'failed to negotiate Docker API version, falling back',
    listContainersFailed: 'failed to list Docker containers',
    missingAccessGroupsHeader: 'missing access groups header'
  },
  config: {
    invalidYamlService: 'ignoring invalid YAML service',
    parseFailed: 'failed to parse config file',
    invalidAccessGroupsHeader: 'invalid access groups header, falling back to auto',
    invalidUserHeader: 'invalid user header, ignoring override',
    invalidDockerHosts: 'ignoring invalid DOCKER_HOSTS entry'
  },
  icons: {
    invalidPath: 'invalid custom icon path',
    fileNotFound: 'custom icon file not found',
    selfhstReferenceNotFound: 'selfhst icon reference not found'
  },
  selfhst: {
    localIndexFailed: 'failed to load local icon index',
    fetchFailed: 'failed to fetch selfhst icon list'
  }
} as const
