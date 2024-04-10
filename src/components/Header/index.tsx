import * as React from 'react';
import { Link as HistoryLink } from 'react-router-dom'

import styled from 'styled-components'
import { useTokenBalanceTreatingWETHasETH } from '../../state/wallet/hooks'

import Menu from '../Menu'
import Row from '../Row'
import Web3Status from '../Web3Status'

import { ChainId, WETH } from '@uniswap/sdk'
import { isMobile } from 'react-device-detect'
import { Text } from 'rebass'
import { useActiveWeb3React } from '../../hooks'
import { useDarkModeManager } from '../../state/user/hooks'
import { YellowCard } from '../Card'

import Logo from '../../assets/svg/logo.svg'
import LogoDark from '../../assets/svg/logo_white.svg'
import Wordmark from '../../assets/svg/wordmark.svg'
import WordmarkDark from '../../assets/svg/wordmark_white.svg'
import { RowBetween } from '../Row'

const HeaderFrame = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: column;
  width: 100%;
  top: 0;
  position: absolute;

  pointer-events: none;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 12px 0 0 0;
    width: calc(100%);
    position: relative;
  `};
  z-index: 2;
`

const HeaderElement = styled.div`
  display: flex;
  align-items: center;
`

const Title = styled.div`
  display: flex;
  align-items: center;
  pointer-events: auto;

  :hover {
    cursor: pointer;
  }
`

const TitleText = styled(Row)`
  width: fit-content;
  white-space: nowrap;
  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    display: none;
  `};
`

const AccountElement = styled.div<{ active: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme, active }) => (!active ? theme.bg1 : theme.bg3)};
  border-radius: 12px;
  white-space: nowrap;

  :focus {
    border: 1px solid blue;
  }
`

const TestnetWrapper = styled.div`
  white-space: nowrap;
  width: fit-content;
  margin-left: 10px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    display: none;
  `};
`

const NetworkCard = styled(YellowCard)`
  width: fit-content;
  margin-right: 10px;
  border-radius: 12px;
  padding: 8px 12px;
`

const UniIcon = styled(HistoryLink)<{ to: string }>`
  transition: transform 0.3s ease;
  :hover {
    transform: rotate(-5deg);
  }
`

const VersionLabel = styled.span<{ isV2?: boolean }>`
  padding: ${({ isV2 }) => (isV2 ? '0.15rem 0.5rem 0.16rem 0.45rem' : '0.15rem 0.5rem 0.16rem 0.35rem')};
  border-radius: 14px;
  background: ${({ theme, isV2 }) => (isV2 ? theme.primary1 : 'none')};
  color: ${({ theme, isV2 }) => (isV2 ? theme.white : theme.primary1)};
  font-size: 0.825rem;
  font-weight: 400;
  :hover {
    user-select: ${({ isV2 }) => (isV2 ? 'none' : 'initial')};
    background: ${({ theme, isV2 }) => (isV2 ? theme.primary1 : 'none')};
    color: ${({ theme, isV2 }) => (isV2 ? theme.white : theme.primary3)};
  }
`

const VersionToggle = styled.a`
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.primary1};
  color: ${({ theme }) => theme.primary1};
  display: flex;
  width: fit-content;
  cursor: pointer;
  text-decoration: none;
  :hover {
    text-decoration: none;
  }
`

export default function Header() {
  const { account, chainId } = useActiveWeb3React()

  const userEthBalance = useTokenBalanceTreatingWETHasETH(account, WETH[chainId])
  const [isDark] = useDarkModeManager()

  return (
    <HeaderFrame>
      {/* <MigrateBanner>
        Uniswap V2 is live! Read the&nbsp;
        <Link href="https://uniswap.org/blog/launch-uniswap-v2/">
          <b>blog post ↗</b>
        </Link>
        &nbsp;or&nbsp;
        <Link href="https://migrate.uniswap.exchange/">
          <b>migrate your liquidity ↗</b>
        </Link>
        .
      </MigrateBanner> */}
      <RowBetween padding="1rem">
        <HeaderElement>
          <Title>
            <UniIcon id="link" to="/">
              <img src={isDark ? LogoDark : Logo} alt="logo" />
            </UniIcon>
            {!isMobile && (
              <TitleText>
                <HistoryLink id="link" to="/">
                  <img
                    style={{ marginLeft: '4px', marginTop: '4px' }}
                    src={isDark ? WordmarkDark : Wordmark}
                    alt="logo"
                  />
                </HistoryLink>
              </TitleText>
            )}
          </Title>
          <TestnetWrapper style={{ pointerEvents: 'auto' }}>
            {!isMobile && (
              <VersionToggle target="_self" href="https://v1.uniswap.exchange">
                <VersionLabel isV2={true}>V2</VersionLabel>
                {/* <VersionLabel isV2={false}>V1</VersionLabel> */}
              </VersionToggle>
            )}
          </TestnetWrapper>
        </HeaderElement>
        <HeaderElement>
          <TestnetWrapper>
            {!isMobile && chainId === ChainId.ROPSTEN && <NetworkCard>Ropsten</NetworkCard>}
            {!isMobile && chainId === ChainId.RINKEBY && <NetworkCard>Rinkeby</NetworkCard>}
            {!isMobile && chainId === ChainId.GÖRLI && <NetworkCard>Görli</NetworkCard>}
            {!isMobile && chainId === ChainId.KOVAN && <NetworkCard>Kovan</NetworkCard>}
          </TestnetWrapper>
          <AccountElement active={!!account} style={{ pointerEvents: 'auto' }}>
            {account && userEthBalance ? (
              <Text style={{ flexShrink: 0 }} px="0.5rem" fontWeight={500}>
                {userEthBalance?.toSignificant(4)} ETH
              </Text>
            ) : null}
            <Web3Status />
          </AccountElement>
          <div style={{ pointerEvents: 'auto' }}>
            <Menu />
          </div>
        </HeaderElement>
      </RowBetween>
    </HeaderFrame>
  )
}
