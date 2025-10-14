export const environment = {
  production: false,
  aws: {
    region: 'us-east-2',
  },
  bedrock: {
    // bedrock IAM user access key
    accessKeyId: '',
    secretAccessKey: '',
    modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    inferenceProfileArn: '',
  },
  lambdaEndpoints: {
    // need to add lambda endpoint to make it work
    startSemgrepScanUrl:
      '',
    semgrepScannerLogsUrl:
      '',
    startHarnessPipelineURL:
      '',
    harnessLogsURL:
      '',
    fetchResultUrl:
      '',
  },
  demo: { mockMode: false },
};
