import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

import { logger, sendSuccess, sendError, sendMessage } from '~/utils';
import { status } from '~/constants';
import { UserSchema } from '~/schemas/User';

dotenv.config();
export const refreshSession = async (request, response) => {
	//  Codes that we might return coming from status
	const { FORBIDDEN, PRE_CONDITION_FAILED } = status;

	//  Destructuring refresh_token from the headers
	const refreshToken = request.get('refreshToken');

	try {
		//  Extracting the payload(data) from the token
		const { payload: payLoad } = jwt.decode(refreshToken, {
			complete: true,
		});

		//  Making sure token is not expired
		if (new Date(payLoad.exp * 1000) < new Date(Date.now())) {
			return sendMessage('Token Expired', response, PRE_CONDITION_FAILED);
		}

		//  Checking token is generated by us
		const inDataBase = await UserSchema.findOne(
			{
				_id: mongoose.Types.ObjectId(payLoad.user.user_id),
				'tokens.refresh_token': refreshToken,
			},
			{ _id: 1, remember_me: 1, email: 1 },
		);

		// eslint-disable-next-line no-underscore-dangle
		if (!inDataBase || !inDataBase._id)
			return sendMessage('Invalid Token', response, FORBIDDEN);

		//  Generating hash for the tokens secret
		const hash = await bcrypt.hash(
			process.env.JWT_SECRET,
			parseInt(process.env.SALT_ROUNDS, 10),
		);

		//  Generating the access token
		const accessToken = jwt.sign(
			{
				user: {
					// eslint-disable-next-line no-underscore-dangle
					user_id: inDataBase._id,
					email: inDataBase.email,
				},
			},
			hash,
			{
				expiresIn: '7d',
			},
		);

		//  Generating the refresh token
		const newRefreshToken = jwt.sign(
			{
				user: {
					// eslint-disable-next-line no-underscore-dangle
					user_id: inDataBase._id,
				},
			},
			hash,
			{
				expiresIn: '7d',
			},
		);

		//  Generating the expiration date for tokens
		const expirationDate = new Date(
			new Date().setDate(new Date().getDate() + 7),
		);

		//  Attaching the timestamps with the tokens
		const accessTokenExpirationTimestamp = expirationDate.getTime();
		const refreshTokenExpirationTimestamp = accessTokenExpirationTimestamp;

		const token = {
			access_token_expiration_timestamp: accessTokenExpirationTimestamp,
			refresh_token_expiration_timestamp: refreshTokenExpirationTimestamp,
			access_token: accessToken,
			refresh_token: newRefreshToken,
		};

		//  Setting default or otherwise user sent value to remember_me
		await UserSchema.updateOne(
			// eslint-disable-next-line no-underscore-dangle
			{ _id: inDataBase._id },
			{ $addToSet: { tokens: token } },
		);

		//  Sending response in case everything went well!
		return sendSuccess(
			{
				token,
			},
			response,
		);
	} catch (exception) {
		//  Log in case of any abnormal crash
		logger('error', 'Error:', exception.message);
		return sendError('Internal Server Error', response, exception);
	}
};
