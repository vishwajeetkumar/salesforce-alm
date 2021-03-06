/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// Node
import * as util from 'util';
import * as moment from 'moment';

// Local
import Messages = require('../messages');
const messages = Messages();

const STATUS_ERROR = 'Error';
const QUERY =
  'SELECT Id, Status, Package2Id, Package2VersionId, Package2Version.SubscriberPackageVersionId, Tag, Branch, CreatedDate ' +
  'FROM Package2VersionCreateRequest ' +
  '%s' + // WHERE, if applicable
  'ORDER BY CreatedDate';
const ERROR_QUERY = "SELECT Message FROM Package2VersionCreateRequestError WHERE ParentRequest.Id = '%s'";
const STATUSES = ['Queued', 'InProgress', 'Success', 'Error'];

class PackageVersionCreateRequestApi {
  // TODO: proper property typing
  [property: string]: any;

  constructor(force?, org?) {
    this.force = force;
    this.org = org;
  }

  list(flags = {}) {
    const whereCaluse = this._constructWhere(flags);
    return this._query(util.format(QUERY, whereCaluse));
  }

  _constructWhere(flags: any = {}) {
    const where = [];

    // filter on created date, days ago: 0 for today, etc
    if (!util.isNullOrUndefined(flags.createdlastdays)) {
      if (isNaN(flags.createdlastdays)) {
        throw new Error(
          messages.getMessage('invalidDaysNumber', ['createdlastdays', flags.createdlastdays], 'packaging')
        );
      }

      if (parseInt(flags.createdlastdays, 10) < 0) {
        throw new Error(
          messages.getMessage('invalidDaysNumber', ['createdlastdays', flags.createdlastdays], 'packaging')
        );
      }

      where.push(`CreatedDate = LAST_N_DAYS:${flags.createdlastdays}`);
    }

    // filter on errors
    if (flags.status) {
      const foundStatus = STATUSES.find(status => status.toLowerCase() === flags.status.toLowerCase());
      if (util.isNullOrUndefined(foundStatus)) {
        const args = [flags.status];
        STATUSES.forEach(status => {
          args.push(status);
        });
        throw new Error(messages.getMessage('invalidStatus', args, 'packaging'));
      }

      where.push(`Status = \'${foundStatus}\'`);
    }

    return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  }

  async byId(package2VersionCreateRequestId) {
    const results = await this._query(util.format(QUERY, `WHERE Id = '${package2VersionCreateRequestId}' `));
    if (results && results.length === 1 && results[0].Status === STATUS_ERROR) {
      const queryErrors = await this._queryErrors(package2VersionCreateRequestId);
      results[0].Error = queryErrors;
    }

    return results;
  }

  async _query(query) {
    const queryResult = await this.force.toolingQuery(this.org, query);
    let results = [];
    if (queryResult.records) {
      results = queryResult.records.map(record => ({
        Id: record.Id,
        Status: record.Status,
        Package2Id: record.Package2Id,
        Package2VersionId: record.Package2VersionId,
        SubscriberPackageVersionId:
          record.Package2Version != null ? record.Package2Version.SubscriberPackageVersionId : null,
        Tag: record.Tag,
        Branch: record.Branch,
        Error: [],
        CreatedDate: moment(record.CreatedDate).format('YYYY-MM-DD HH:mm')
      }));
    }

    return results;
  }

  async _queryErrors(package2VersionCreateRequestId) {
    const errorResults = [];

    const queryResult = await this.force.toolingQuery(
      this.org,
      util.format(ERROR_QUERY, package2VersionCreateRequestId)
    );
    if (queryResult.records) {
      queryResult.records.forEach(record => {
        errorResults.push(record.Message);
      });
    }

    return errorResults;
  }
}

export = PackageVersionCreateRequestApi;
