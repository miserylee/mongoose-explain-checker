import { Document, Model, Query, Schema } from 'mongoose';

const checkPlan = (plan: any) => {
  const { stage, filter, sortPattern, inputStage, inputStages = [] } = plan;

  let error: Error & {
    filter?: any;
    sortPattern?: any;
    type?: string;
    stage?: string;
  } | null = null;
  if (stage === 'COLLSCAN') {
    error = new Error(`Abnormal stage [${stage}]. Filter is ${JSON.stringify(filter)}`);
    error.filter = filter;
  } else if (stage === 'SORT') {
    error = new Error(`Abnormal stage [${stage}]. SortPattern is ${JSON.stringify(sortPattern)}`);
    error.sortPattern = sortPattern;
  }
  if (error) {
    error.type = 'ExplainError';
    error.name = 'ExplainError';
    error.stage = stage;
    throw error;
  }
  if (inputStage) {
    inputStages.push(inputStage);
  }
  inputStages.forEach((subPlan: any) => checkPlan(subPlan));
};

const mongooseExplain = (schema: Schema, options: any) => {
  const getExplainModel = (ExplainModel: Model<Document>) => {
    const explainModelName = `explain_${ExplainModel.modelName}`;
    try {
      return options.connection.model(explainModelName);
    } catch (err) {
      const copySchema: Schema & {
        $globalPluginsApplied?: boolean;
      } = schema.clone() as Schema & { _indexes: any };
      copySchema.$globalPluginsApplied = true;
      copySchema.indexes = schema.indexes;
      copySchema.statics.explain = async (query: any) => new Promise((resolve, reject) => {
        query._collection.find(query._conditions, Object.assign({
          explain: true,
        }, query.options), (error: Error, stats: any) => {
          if (error) {
            return reject(error);
          }
          resolve(stats[0].queryPlanner.winningPlan);
        });
      });
      return options.connection.model(explainModelName, copySchema);
    }
  };

  const execExplain = function <T extends Document>(this: Query<T> & {
    _conditions: any;
    options: any;
    model: Model<T>;
    op: string;
  }, next: any) {
    const keys = Object.keys(this._conditions);
    if (!('sort' in this.options) || (() => {
        const sortKeys = Object.keys(this.options.sort);
        if (sortKeys.length === 0) {
          return true;
        }
        return sortKeys.length === 1 && keys[0] === '_id';
      })()) {
      if (keys.length === 0 || (keys.length === 1 && keys[0] === '_id')) {
        return next();
      }
    }
    const ExplainModel = getExplainModel(this.model);
    (async () => {
      const winningPlan = await ExplainModel.explain(this);
      checkPlan(winningPlan);
    })().then(next).catch(error => {
      error.message = `${error.message}. You may executed:
       ${this.model.modelName}.${this.op}(${JSON.stringify(this._conditions)}, ${JSON.stringify(this.options)})`;
      next(error);
    });
  };

  schema.pre('find', execExplain);
  schema.pre('findOne', execExplain);
};

export = mongooseExplain;
