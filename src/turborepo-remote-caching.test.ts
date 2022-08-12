import { App, Stack } from 'aws-cdk-lib';
import { Capture, Template } from 'aws-cdk-lib/assertions';
import { TurborepoRemoteCaching, TurborepoRemoteCachingProps } from '../src/turborepo-remote-caching';
import { TokenStorage } from './constants';

describe('S3 Lifecycle Rules', () => {

  test('There should only be one lifecycle rule', () => {
    const template = templateHarness();

    const lifecycleRules = new Capture();
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: lifecycleRules,
      },
    });

    expect(lifecycleRules.asArray().length).toBe(1);
  });

  test('Default cache expiration should be 7 days', () => {
    const template = templateHarness();

    const lifecycleRules = new Capture();
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: lifecycleRules,
      },
    });

    expect(lifecycleRules.asArray()[0].ExpirationInDays).toBe(7);
  });

  test('Cache expiration should be configurable', () => {
    const s3ExpirationDays = 33;
    const template = templateHarness({ s3ExpirationDays });

    const lifecycleRules = new Capture();
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: lifecycleRules,
      },
    });

    expect(lifecycleRules.asArray()[0].ExpirationInDays).toBe(s3ExpirationDays);
  });

});

describe('Secrets Manager', () => {
  test('should not yet be supported', () => {
    expect(() => { templateHarness({ tokenStorage: TokenStorage.SECRETS_MANAGER }); }).toThrowError();
  });
});


const templateHarness = (props?: TurborepoRemoteCachingProps) => {
  // harness
  const app = new App({ analyticsReporting: false });
  const stack = new Stack(app, TurborepoRemoteCaching.name);
  new TurborepoRemoteCaching(stack, TurborepoRemoteCaching.name, props);

  // generate template we can use to test
  const template = Template.fromStack(stack);

  // return testable template
  return template;
};