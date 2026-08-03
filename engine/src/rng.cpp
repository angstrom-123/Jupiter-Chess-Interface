#include "rng.h"

#define ROTL(d,lrot) ((d<<(lrot)) | (d>>(8*sizeof(d)-(lrot))))

RomuQuadRandom::RomuQuadRandom(uint64_t state[4]) 
{
    m_StateW = state[0];
    m_StateX = state[1];
    m_StateY = state[2];
    m_StateZ = state[3];
}

void RomuQuadRandom::Warm(uint8_t iterations)
{
    for (uint8_t i = 0; i < iterations; i++)
        Generate();
}

uint64_t RomuQuadRandom::Generate()
{
   uint64_t wp = m_StateW, xp = m_StateX, yp = m_StateY, zp = m_StateZ;
   m_StateW = 15241094284759029579u * zp; // a-mult
   m_StateX = zp + ROTL(wp, 52);          // b-rotl, c-add
   m_StateY = yp - xp;                    // d-sub
   m_StateZ = yp + wp;                    // e-add
   m_StateZ = ROTL(m_StateZ, 19);         // f-rotl
   return xp;
}
