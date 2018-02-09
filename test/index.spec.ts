import * as assert from 'assert';
import 'definitions';
import { createConnection, Schema } from 'mongoose';
import * as timestamp from 'mongoose-timestamp';
import * as explain from '../src';

const connection = createConnection('mongodb://localhost/test');

const schema = new Schema({
  key1: String,
  key2: String,
  key3: String,
});

schema.index({ key1: 1 }, { unique: true });
schema.index({ key2: 1, key3: 1 });

schema.plugin(timestamp);
schema.plugin(explain, { connection });

const Model = connection.model('test-explain', schema);

describe('Explain', () => {
  it('should ok', done => {
    Model.findOne().sort({ key3: -1 }).limit(10).then(_ => {
      done(new Error('execute success?'));
    }).catch(error => {
      assert(error.stage === 'SORT');
      done();
    });
  });
  it('should be ok too', done => {
    Model.find({ key3: 'test' }).then(_ => {
      done(new Error('execute success?'));
    }).catch(error => {
      assert(error.stage === 'COLLSCAN');
      done();
    });
  });
});

after(async () => {
  connection.close();
});
