#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { NotetakerStack } from '../lib/notetaker-stack';

const app = new cdk.App();
new NotetakerStack(app, 'NotetakerStack');
